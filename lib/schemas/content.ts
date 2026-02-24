import { z } from "zod";

export const PROCESSING_STATUS_VALUES = ["pending", "processing", "completed", "failed"] as const;

export const IngestRequestSchema = z.object({
	url: z.string().url("Invalid URL provided")
});

export const ContentFilterSchema = z.object({
	category: z.string().trim().min(1).optional(),
	processingStatus: z.enum(PROCESSING_STATUS_VALUES).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const IngestResponseSchema = z.object({
	id: z.uuid(),
	url: z.string().url(),
	processingStatus: z.enum(PROCESSING_STATUS_VALUES),
	message: z.string()
});

export interface IngestRequest {
	url: string;
}

export interface IngestResponse {
	id: string;
	url: string;
	processingStatus: (typeof PROCESSING_STATUS_VALUES)[number];
	message: string;
}
