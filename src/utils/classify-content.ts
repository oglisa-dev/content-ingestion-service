import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { logger, retry } from "@trigger.dev/sdk/v3";

import { LLM_MODEL, LLM_RETRY_MAX_ATTEMPTS, MAX_CONTENT_CHARS } from "@/lib/constants";
import { ClassifyContentResponseSchema, type ClassifyContentResponse } from "@/lib/schemas/content";
import {
	buildContentClassificationPrompt,
	type ClassificationPromptInput
} from "@/src/prompts/content-classification-prompt";
import { type ExtractedContent } from "@/src/utils/content-extraction";

const RETRY_FACTOR = 2;
const RETRY_MIN_TIMEOUT_MS = 1000;
const RETRY_MAX_TIMEOUT_MS = 30_000;

export async function classifyAndSummarizeWithRetry(
	extractedContent: ExtractedContent
): Promise<ClassifyContentResponse> {
	const input = toClassificationPromptInput(extractedContent);
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
