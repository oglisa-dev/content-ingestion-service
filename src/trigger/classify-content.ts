import { retry, task } from "@trigger.dev/sdk/v3";

import { type ClassifyContentResponse } from "@/lib/schemas/content";
import { type ExtractedContent } from "@/src/utils/content-extraction";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { LLM_MODEL, LLM_RETRY_MAX_ATTEMPTS, MAX_CONTENT_CHARS } from "@/lib/constants";
import {
	buildContentClassificationPrompt,
	type ClassificationPromptInput
} from "@/src/prompts/content-classification-prompt";
import { ClassifyContentResponseSchema } from "@/lib/schemas/content";
import { logger } from "@trigger.dev/sdk/v3";

const RETRY_FACTOR = 2;
const RETRY_MIN_TIMEOUT_MS = 1000;
const RETRY_MAX_TIMEOUT_MS = 30_000;

interface ClassifyContentPayload {
	content: ExtractedContent;
}

export const ClassifyContentTask = task({
	id: "classify-content",
	run: async (payload: ClassifyContentPayload): Promise<ClassifyContentResponse> => {
		logger.info("Starting content classification task", { payload });

		const input = toClassificationPromptInput(payload.content);
		if (!input) {
			throw new Error("No body text extracted for AI classification.");
		}

		return retry.onThrow(
			async ({ attempt }) => {
				try {
					return await classifyAndSummarizeContent(input);
				} catch (error) {
					logger.warn("LLM classification attempt failed", { attempt, error });
					throw error;
				}
			},
			{
				maxAttempts: LLM_RETRY_MAX_ATTEMPTS,
				factor: RETRY_FACTOR,
				minTimeoutInMs: RETRY_MIN_TIMEOUT_MS,
				maxTimeoutInMs: RETRY_MAX_TIMEOUT_MS,
				randomize: false
			}
		);
	}
});

async function classifyAndSummarizeContent(input: ClassificationPromptInput): Promise<ClassifyContentResponse> {
	const prompt = buildContentClassificationPrompt(input);
	const { output } = await generateText({
		model: openai(LLM_MODEL),
		output: Output.object({
			schema: ClassifyContentResponseSchema
		}),
		prompt
	});

	return output;
}

function toClassificationPromptInput(extractedContent: ExtractedContent): ClassificationPromptInput | null {
	const truncatedBodyText = extractedContent.bodyText?.slice(0, MAX_CONTENT_CHARS);
	if (!truncatedBodyText) {
		return null;
	}

	return {
		title: extractedContent.title,
		author: extractedContent.author,
		publishDate: extractedContent.publishDate,
		bodyText: truncatedBodyText
	};
}
