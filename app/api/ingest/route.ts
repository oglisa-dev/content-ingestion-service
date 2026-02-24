import { NextResponse } from "next/server";

import { type IngestRequest, type IngestResponse } from "@/lib/schemas/content";
import { supabaseAdmin } from "@/lib/supabase/supabase-admin";
import { ingestContentTask } from "@/src/trigger/ingest-content";
import { z } from "zod";

const IngestRequestSchema = z.object({
	url: z.url()
});

export async function POST(request: Request): Promise<NextResponse> {
	const requestBody = await parseRequestBody(request);
	if (!requestBody) {
		return NextResponse.json({ error: "Invalid request payload. Expected a JSON body." }, { status: 400 });
	}

	const parseResult = IngestRequestSchema.safeParse(requestBody);
	if (!parseResult.success) {
		return NextResponse.json(
			{ error: "Invalid request payload.", details: parseResult.error.issues },
			{ status: 400 }
		);
	}

	const normalizedURL = normalizeUrl(parseResult.data.url);
	const existingContentRecord = await findContentByURL(normalizedURL);

	if (existingContentRecord) {
		const existingResponse: IngestResponse = {
			id: existingContentRecord.id,
			url: existingContentRecord.url,
			processingStatus: existingContentRecord.processing_status,
			message: "URL already ingested. Returning existing record."
		};

		return NextResponse.json(existingResponse, { status: 200 });
	}

	const createdContentRecord = await createPendingRecord(normalizedURL);

	try {
		await ingestContentTask.trigger({
			contentId: createdContentRecord.id,
			url: createdContentRecord.url
		});
	} catch (error) {
		await markIngestionFailed(createdContentRecord.id, error);
		return NextResponse.json({ error: "Failed to schedule ingestion task." }, { status: 500 });
	}

	const successResponse: IngestResponse = {
		id: createdContentRecord.id,
		url: createdContentRecord.url,
		processingStatus: createdContentRecord.processing_status,
		message: "Ingestion started."
	};

	return NextResponse.json(successResponse, { status: 202 });
}

async function parseRequestBody(request: Request): Promise<IngestRequest | null> {
	try {
		return (await request.json()) as IngestRequest;
	} catch {
		return null;
	}
}

function normalizeUrl(url: string): string {
	return url.trim();
}

interface ContentRecord {
	id: string;
	url: string;
	processing_status: IngestResponse["processingStatus"];
}

/**
 * Finds a content record by URL.
 * @param URL - The URL to find the content record by.
 * @returns The content record if found, otherwise null.
 */
async function findContentByURL(URL: string): Promise<ContentRecord | null> {
	try {
		console.info("Finding content record by URL from the database...", { URL });
		const { data } = await supabaseAdmin
			.from("content")
			.select("id, url, processing_status")
			.eq("url", URL)
			.maybeSingle()
			.throwOnError();

		return data;
	} catch (error) {
		console.error("Failed to find content record by URL", { URL, error });
		throw error;
	}
}

/**
 * Creates a pending content record for a given URL.
 * @param URL - The URL to create a pending content record for.
 * @returns The created content record.
 */
async function createPendingRecord(url: string): Promise<ContentRecord> {
	try {
		console.info("Creating pending content record for URL...", { url });
		const { data } = await supabaseAdmin
			.from("content")
			.insert({
				url,
				processing_status: "pending"
			})
			.select("id, url, processing_status")
			.single()
			.throwOnError();

		console.info("Content record in state 'pending' created successfully", { data });

		return data;
	} catch (error) {
		console.error("Failed to create pending content record", { url, error });
		throw error;
	}
}
/**
 * Marks a content record as failed.
 * @param contentId - The ID of the content record to mark as failed.
 * @param error - The error that occurred.
 */
async function markIngestionFailed(contentID: string, error: unknown): Promise<void> {
	try {
		const message = error instanceof Error ? error.message : "Unknown Trigger.dev error";

		console.info("Marking content record processing status as 'failed'...", { contentID, message });
		await supabaseAdmin
			.from("content")
			.update({
				processing_status: "failed",
				processing_error_message: message
			})
			.eq("id", contentID)
			.throwOnError();

		console.info("Content record processing status marked as 'failed' successfully", { contentID });
	} catch (error) {
		console.error("Failed to mark content record as failed", { contentID, error });
		// we don't want to throw an error here because we want to continue with the request.
	}
}
