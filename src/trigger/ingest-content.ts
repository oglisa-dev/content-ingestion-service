import { logger, task } from "@trigger.dev/sdk/v3";

interface IngestContentPayload {
	contentId: string;
	url: string;
}

export const ingestContentTask = task({
	id: "ingest-content",
	run: async (payload: IngestContentPayload) => {
		logger.info("Ingestion task queued", {
			contentId: payload.contentId,
			url: payload.url
		});

		// Step 6+ will implement fetch/extract/LLM and DB update logic.
		return {
			contentId: payload.contentId,
			queuedAt: new Date().toISOString()
		};
	}
});
