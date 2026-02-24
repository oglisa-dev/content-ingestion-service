import { task } from "@trigger.dev/sdk/v3";

import { classifyAndSummarizeWithRetry } from "@/src/utils/classify-content";
import { fetchAndExtractMainContent } from "@/src/utils/content-extraction";
import { type ExtractedContent } from "@/src/utils/content-extraction";
import { type ClassifyContentResponse } from "@/lib/schemas/content";
import { supabaseAdmin } from "@/lib/supabase/supabase-admin";
import { CONTENT_TABLE } from "@/lib/constants";
import { logger } from "@trigger.dev/sdk/v3";

interface IngestContentPayload {
	contentId: string;
	url: string;
}

export const IngestContentTask = task({
	id: "ingest-content",
	run: async (payload: IngestContentPayload) => {
		await markContentAsProcessing(payload.contentId);

		try {
			const extractedContent = await fetchAndExtractMainContent(payload.url);
			const aiMetadata = await classifyAndSummarizeWithRetry(extractedContent);
			await markContentAsCompleted(payload.contentId, extractedContent, aiMetadata);

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
		await supabaseAdmin
			.from(CONTENT_TABLE)
			.update({
				processing_status: "processing",
				processing_error_message: null
			})
			.eq("id", contentId)
			.throwOnError();
	} catch (error) {
		logger.error("Failed to set content status to processing", { contentId, error });
		throw error;
	}
}

export async function markContentAsCompleted(
	contentId: string,
	extractedContent: ExtractedContent,
	aiMetadata: ClassifyContentResponse
): Promise<void> {
	try {
		await supabaseAdmin
			.from(CONTENT_TABLE)
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
	} catch (error) {
		logger.error("Failed to persist completed content", { contentId, error });
		throw error;
	}
}

export async function markContentAsFailed(contentId: string, error: unknown): Promise<void> {
	const message = error instanceof Error ? error.message : "Unknown processing error";

	try {
		await supabaseAdmin
			.from(CONTENT_TABLE)
			.update({
				processing_status: "failed",
				processing_error_message: message
			})
			.eq("id", contentId)
			.throwOnError();
	} catch (updateError) {
		logger.error("Failed to persist failed status", {
			contentId,
			originalError: message,
			updateError
		});
	}
}
