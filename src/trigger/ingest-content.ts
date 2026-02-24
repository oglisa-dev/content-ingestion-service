import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import axios from "axios";
import * as cherio from "cherio";
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

const AUTHOR_META_SELECTORS = [
	'meta[name="author"]',
	'meta[property="article:author"]',
	'meta[name="byline"]'
] as const;
const PUBLISH_DATE_META_SELECTORS = [
	'meta[property="article:published_time"]',
	'meta[name="pubdate"]',
	'meta[name="publish_date"]',
	'meta[name="date"]'
] as const;
const TITLE_META_SELECTORS = ['meta[property="og:title"]', 'meta[name="twitter:title"]'] as const;
const CONTENT_ROOT_SELECTORS = ["article", "main", '[role="main"]', ".post-content", ".entry-content"] as const;

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

async function markContentAsProcessing(contentID: string): Promise<void> {
	try {
		await supabaseAdmin
			.from("content")
			.update({
				processing_status: "processing",
				processing_error_message: null
			})
			.eq("id", contentID)
			.throwOnError();
	} catch (error) {
		logger.error("Failed to set content status to processing", { contentID, error });
		throw error;
	}
}

async function fetchAndExtractMainContent(url: string): Promise<ExtractedContent> {
	try {
		const html = await fetchHtmlFromURL(url);
		return extractMainContentFromHtml(html);
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

function extractMainContentFromHtml(html: string): ExtractedContent {
	const $ = cherio.load(html);
	const title = extractTitleFromHtml($);
	const author = extractAuthorFromHtml($);
	const publishDate = extractPublishDateFromHtml($);
	const bodyText = extractBodyTextFromHtml($);

	if (!bodyText) {
		throw new Error("Could not extract readable article content.");
	}

	return {
		title,
		bodyText,
		author,
		publishDate
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

function extractTitleFromHtml($: cherio.Root): string | null {
	const socialTitle = extractMetaContent($, TITLE_META_SELECTORS);
	if (socialTitle) {
		return socialTitle;
	}

	const documentTitle = normalizeText($("title").first().text());
	if (!documentTitle) {
		return null;
	}

	return documentTitle;
}

function extractAuthorFromHtml($: cherio.Root): string | null {
	return extractMetaContent($, AUTHOR_META_SELECTORS);
}

function extractPublishDateFromHtml($: cherio.Root): string | null {
	const publishDateMeta = extractMetaContent($, PUBLISH_DATE_META_SELECTORS);
	if (publishDateMeta) {
		return toIsoDate(publishDateMeta);
	}

	const timeValue = normalizeText($("time[datetime]").first().attr("datetime") ?? null);
	if (!timeValue) {
		return null;
	}

	return toIsoDate(timeValue);
}

function extractBodyTextFromHtml($: cherio.Root): string | null {
	for (const selector of CONTENT_ROOT_SELECTORS) {
		const root = $(selector).first();
		if (!root.length) {
			continue;
		}

		const paragraphs = root
			.find("p")
			.map((_index: number, element: unknown) => normalizeText($(element).text()))
			.get()
			.filter(Boolean) as string[];
		const joinedParagraphs = normalizeText(paragraphs.join(" "));

		if (joinedParagraphs) {
			return joinedParagraphs.slice(0, MAX_CONTENT_CHARS);
		}
	}

	const fallbackParagraphs = $("p")
		.map((_index: number, element: unknown) => normalizeText($(element).text()))
		.get()
		.filter(Boolean) as string[];
	const fallbackText = normalizeText(fallbackParagraphs.join(" "));

	if (!fallbackText) {
		return null;
	}

	return fallbackText.slice(0, MAX_CONTENT_CHARS);
}

function extractMetaContent($: cherio.Root, selectors: readonly string[]): string | null {
	for (const selector of selectors) {
		const value = normalizeText($(selector).first().attr("content") ?? null);
		if (value) {
			return value;
		}
	}

	return null;
}

function normalizeText(value: string | null): string | null {
	if (!value) {
		return null;
	}

	const normalized = value.replace(/\s+/g, " ").trim();
	if (!normalized) {
		return null;
	}

	return normalized;
}

function toIsoDate(value: string): string | null {
	const parsedDate = new Date(value);
	if (Number.isNaN(parsedDate.valueOf())) {
		return null;
	}

	return parsedDate.toISOString();
}

function getBackoffDelay(attempt: number): number {
	return 1000 * 2 ** (attempt - 1);
}

function sleep(delayMs: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, delayMs);
	});
}
