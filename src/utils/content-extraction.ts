import * as cherio from "cherio";

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

export interface ExtractedContent {
	title: string | null;
	bodyText: string | null;
	author: string | null;
	publishDate: string | null;
}

export function extractMainContentFromHtml(html: string): ExtractedContent {
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

function extractTitleFromHtml($: cherio.Root): string | null {
	const socialTitle = extractMetaContent($, TITLE_META_SELECTORS);
	if (socialTitle) {
		return socialTitle;
	}

	return normalizeText($("title").first().text());
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
			return joinedParagraphs;
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

	return fallbackText;
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
