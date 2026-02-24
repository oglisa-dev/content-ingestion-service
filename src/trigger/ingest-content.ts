import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { logger, task } from "@trigger.dev/sdk/v3";

import {
	AXIOS_TIMEOUT_MS,
	CONTENT_TABLE,
	LLM_MODEL,
	LLM_RETRY_MAX_ATTEMPTS,
	LOW_CONFIDENCE_THRESHOLD,
	MAX_CONTENT_CHARS
} from "@/lib/constants";
import { ClassifyContentResponseSchema, type ClassifyContentResponse } from "@/lib/schemas/content";
import { supabaseAdmin } from "@/lib/supabase/supabase-admin";

interface IngestContentPayload {
	contentId: string;
	url: string;
}

interface ExtractedContent {
	title: string | null;
	bodyText: string | null;
	author: string | null;
	publishDate: string | null;
}

export const ingestContentTask = task({
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

async function markContentAsProcessing(contentId: string): Promise<void> {
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

async function fetchAndExtractMainContent(url: string): Promise<ExtractedContent> {
	try {
		const html = await fetchHtmlFromURL(url);
		return extractMainContentFromHtml(html, url);
	} catch (error) {
		logger.error("Failed to fetch and extract content", { url, error });
		throw error;
	}
}

async function fetchHtmlFromURL(url: string): Promise<string> {
	try {
		const response = await axios.get<string>(url, {
			timeout: AXIOS_TIMEOUT_MS,
			responseType: "text",
			maxRedirects: 5,
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; ContentIngestionBot/1.0; +https://example.com/bot)"
			},
			validateStatus: (status) => status >= 200 && status < 400
		});

		if (!response.data || !response.data.trim()) {
			throw new Error("Fetched page is empty.");
		}

		return response.data;
	} catch (error) {
		logger.error("Failed to fetch HTML from URL", { url, error });
		throw error;
	}
}

function extractMainContentFromHtml(html: string, url: string): ExtractedContent {
	const dom = new JSDOM(html, { url });
	const document = dom.window.document;
	const readability = new Readability(document);
	const article = readability.parse();

	if (!article?.textContent?.trim()) {
		throw new Error("Could not extract readable article content.");
	}

	return {
		title: article.title ?? document.title ?? null,
		bodyText: article.textContent.trim().slice(0, MAX_CONTENT_CHARS),
		author: getAuthorFromDocument(document),
		publishDate: getPublishDateFromDocument(document)
	};
}

async function classifyAndSummarizeWithRetry(extractedContent: ExtractedContent): Promise<ClassifyContentResponse> {
	const truncatedBodyText = extractedContent.bodyText?.slice(0, MAX_CONTENT_CHARS);
	if (!truncatedBodyText) {
		throw new Error("No body text extracted for AI classification.");
	}

	let lastError: unknown = null;

	for (let attempt = 1; attempt <= LLM_RETRY_MAX_ATTEMPTS; attempt += 1) {
		try {
			return await classifyAndSummarizeContent({
				title: extractedContent.title,
				author: extractedContent.author,
				publishDate: extractedContent.publishDate,
				bodyText: truncatedBodyText
			});
		} catch (error) {
			lastError = error;
			logger.warn("LLM classification attempt failed", { attempt, error });
			await sleep(getBackoffDelay(attempt));
		}
	}

	throw new Error(
		`LLM classification failed after ${LLM_RETRY_MAX_ATTEMPTS} attempts: ${
			lastError instanceof Error ? lastError.message : "Unknown error"
		}`
	);
}

interface ClassifyInput {
	title: string | null;
	author: string | null;
	publishDate: string | null;
	bodyText: string;
}

async function classifyAndSummarizeContent(input: ClassifyInput): Promise<ClassifyContentResponse> {
	try {
		const prompt = buildClassificationPrompt(input);
		const { object } = await generateObject({
			model: openai(LLM_MODEL),
			schema: ClassifyContentResponseSchema,
			prompt
		});

		return object;
	} catch (error) {
		logger.error("Failed to classify content with LLM", { error });
		throw error;
	}
}

function buildClassificationPrompt(input: ClassifyInput): string {
	return `
You are a content classification assistant.

Classify the article into one of these categories:
- technology
- business
- science
- health
- sports
- politics
- entertainment
- other

Return:
1) category
2) summary (2-3 concise sentences)
3) confidenceScore (0 to 1)

Article title: ${input.title ?? "Unknown"}
Author: ${input.author ?? "Unknown"}
Publish date: ${input.publishDate ?? "Unknown"}
Body:
${input.bodyText}
`;
}

async function markContentAsCompleted(
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

async function markContentAsFailed(contentId: string, error: unknown): Promise<void> {
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

function getAuthorFromDocument(document: Document): string | null {
	const authorValue = readMetaContent(document, [
		'meta[name="author"]',
		'meta[property="article:author"]',
		'meta[name="byline"]'
	]);

	if (!authorValue) {
		return null;
	}

	return authorValue.trim() || null;
}

function getPublishDateFromDocument(document: Document): string | null {
	const publishDateValue = readMetaContent(document, [
		'meta[property="article:published_time"]',
		'meta[name="pubdate"]',
		'meta[name="publish_date"]',
		'meta[name="date"]',
		"time[datetime]"
	]);

	if (!publishDateValue) {
		return null;
	}

	const parsedDate = new Date(publishDateValue);
	if (Number.isNaN(parsedDate.valueOf())) {
		return null;
	}

	return parsedDate.toISOString();
}

function readMetaContent(document: Document, selectors: string[]): string | null {
	for (const selector of selectors) {
		const element = document.querySelector(selector);
		if (!element) {
			continue;
		}

		const content = element.getAttribute("content") ?? element.getAttribute("datetime");
		if (content?.trim()) {
			return content;
		}
	}

	return null;
}

function getBackoffDelay(attempt: number): number {
	return 1000 * 2 ** (attempt - 1);
}

function sleep(delayMs: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, delayMs);
	});
}
