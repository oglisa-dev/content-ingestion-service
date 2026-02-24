import { z } from "zod";

export const PROCESSING_STATUS_VALUES = ["pending", "processing", "completed", "failed"] as const;
export const CONTENT_CATEGORY_VALUES = [
	"technology",
	"business",
	"science",
	"health",
	"sports",
	"politics",
	"entertainment",
	"other"
] as const;

export const IngestRequestSchema = z.object({
	url: z.url("Invalid URL provided")
});

export const ContentFilterSchema = z.object({
	category: z.string().trim().min(1).optional(),
	processingStatus: z.enum(PROCESSING_STATUS_VALUES).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const IngestResponseSchema = z.object({
	id: z.uuid(),
	url: z.url(),
	processingStatus: z.enum(PROCESSING_STATUS_VALUES),
	message: z.string()
});

export const ClassifyContentResponseSchema = z.object({
	category: z.enum(CONTENT_CATEGORY_VALUES),
	summary: z
		.string()
		.trim()
		.min(40, "Summary is too short.")
		.max(400, "Summary is too long."),
	confidenceScore: z.number().min(0).max(1)
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

export interface ClassifyContentResponse {
	category: (typeof CONTENT_CATEGORY_VALUES)[number];
	summary: string;
	confidenceScore: number;
}
