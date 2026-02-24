import { logger, task } from "@trigger.dev/sdk/v3";

import { extractMainContentFromHtml, type ExtractedContent } from "@/src/utils/content-extraction";
import axios from "axios";
import { AXIOS_TIMEOUT_MS } from "@/lib/constants";

interface ExtractContentPayload {
	url: string;
}

export const ExtractContentTask = task({
	id: "extract-content",
	run: async (payload: ExtractContentPayload): Promise<ExtractedContent> => {
		logger.info("Starting content extraction task", { payload });

		try {
			const html = await fetchHtmlFromURL(payload.url);
			return extractMainContentFromHtml(html);
		} catch (error) {
			logger.error("Failed to extract main content from HTML", { error });
			throw error;
		}
	}
});

async function fetchHtmlFromURL(url: string): Promise<string> {
	logger.info("Fetching HTML content from the provided URL", { url });
	const response = await axios.get<string>(url, {
		timeout: AXIOS_TIMEOUT_MS,
		responseType: "text",
		maxRedirects: 5,
		headers: {
			"User-Agent": "Mozilla/5.0 (compatible; ContentIngestionBot/1.0; +https://example.com/bot)"
		},
		validateStatus: (status) => status >= 200 && status < 400
	});

	logger.info("HTML content fetched successfully", { url });

	if (!response.data || !response.data.trim()) {
		logger.error("Fetched HTML page content is empty", { url });
		throw new Error("Fetched HTML page content is empty.");
	}

	return response.data;
}
