import { idempotencyKeys, logger, task } from "@trigger.dev/sdk/v3";

import { ClassifyContentTask } from "@/src/trigger/classify-content";
import { ExtractContentTask } from "@/src/trigger/extract-content";
import { type ExtractedContent } from "@/src/utils/content-extraction";
import { type ClassifyContentResponse } from "@/lib/schemas/content";
import { supabaseAdmin } from "@/lib/supabase/supabase-admin";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/constants";

interface IngestContentPayload {
	contentId: string;
	url: string;
}

export const IngestContentTask = task({
	id: "ingest-content",
	run: async (payload: IngestContentPayload) => {
		logger.info("Starting content ingestion task", { payload });
		const URL = payload.url;

		await markContentAsProcessing(payload.contentId);
		const idempotencyKey = await idempotencyKeys.create(payload.contentId);

		try {
			const extractedContent = await ExtractContentTask.triggerAndWait(
				{
					url: URL
				},
				{
					idempotencyKey
				}
			).unwrap();

			const aiMetadata = await ClassifyContentTask.triggerAndWait(
				{
					extractedContent
				},
				{
					idempotencyKey
				}
			).unwrap();

			await updateCompletedContent(payload.contentId, extractedContent, aiMetadata);

			return {
				contentId: payload.contentId,
				processingStatus: "completed"
			};
		} catch (error) {
			await markContentAsFailed(payload.contentId, error);
			throw error;
		}
	}
});

export async function markContentAsProcessing(contentId: string): Promise<void> {
	try {
		logger.info("Marking content processing status as 'processing' in the database...", { contentId });
		await supabaseAdmin
			.from("content")
			.update({
				processing_status: "processing",
				processing_error_message: null
			})
			.eq("id", contentId)
			.throwOnError();

		logger.info("Content processing status marked as 'processing' in the database successfully", { contentId });
	} catch (error) {
		logger.error("Failed to set content status to processing", { contentId, error });
		throw error;
	}
}

export async function updateCompletedContent(
	contentId: string,
	extractedContent: ExtractedContent,
	aiMetadata: ClassifyContentResponse
): Promise<void> {
	try {
		logger.info("Marking content processing status as 'completed' in the database...", { contentId });
		await supabaseAdmin
			.from("content")
			.update({
				title: extractedContent.title,
				body_text: extractedContent.bodyText,
				author: extractedContent.author,
				publish_date: extractedContent.publishDate,
				summary: aiMetadata.summary,
				category: aiMetadata.category,
				confidence_score: aiMetadata.confidenceScore,
				needs_review: aiMetadata.confidenceScore < LOW_CONFIDENCE_THRESHOLD,
				processing_status: "completed",
				processing_error_message: null
			})
			.eq("id", contentId)
			.throwOnError();

		logger.info("Content processing status marked as 'completed' in the database successfully", { contentId });
	} catch (error) {
		logger.error("Failed to persist completed content", { contentId, error });
		throw error;
	}
}

export async function markContentAsFailed(contentId: string, error: unknown): Promise<void> {
	const message = error instanceof Error ? error.message : "Unknown processing error";

	try {
		logger.info("Marking content processing status as 'failed' in the database...", { contentId });
		await supabaseAdmin
			.from("content")
			.update({
				processing_status: "failed",
				processing_error_message: message
			})
			.eq("id", contentId)
			.throwOnError();

		logger.info("Content processing status marked as 'failed' in the database successfully", { contentId });
	} catch (updateError) {
		logger.error("Failed to persist failed status", {
			contentId,
			originalError: message,
			updateError
		});
	}
}
