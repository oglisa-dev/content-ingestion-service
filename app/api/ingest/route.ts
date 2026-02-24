import { NextResponse } from "next/server";

import {
  DEFAULT_PROCESSING_STATUS,
  SUPABASE_UNIQUE_VIOLATION_CODE,
} from "@/lib/constants";
import {
  IngestRequestSchema,
  type IngestRequest,
  type IngestResponse,
} from "@/lib/schemas/content";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ingestContentTask } from "@/src/trigger/ingest-content";

const CONTENT_TABLE = "content";
const EMPTY_RESULT_CODE = "PGRST116";

export async function POST(request: Request): Promise<NextResponse> {
  const requestBody = await parseRequestBody(request);
  if (!requestBody) {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parseResult = IngestRequestSchema.safeParse(requestBody);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request payload.", details: parseResult.error.issues },
      { status: 400 },
    );
  }

  const normalizedUrl = normalizeUrl(parseResult.data.url);

  const existingRecord = await findContentByUrl(normalizedUrl);
  if (existingRecord.error) {
    return NextResponse.json(
      { error: `Failed to check existing content: ${existingRecord.error}` },
      { status: 500 },
    );
  }

  if (existingRecord.data) {
    const existingResponse: IngestResponse = {
      id: existingRecord.data.id,
      url: existingRecord.data.url,
      processingStatus: existingRecord.data.processing_status,
      message: "URL already ingested. Returning existing record.",
    };

    return NextResponse.json(existingResponse, { status: 200 });
  }

  const createdRecord = await createPendingRecord(normalizedUrl);
  if (createdRecord.error || !createdRecord.data) {
    return NextResponse.json(
      { error: `Failed to create content record: ${createdRecord.error}` },
      { status: 500 },
    );
  }

  try {
    await ingestContentTask.trigger({
      contentId: createdRecord.data.id,
      url: createdRecord.data.url,
    });
  } catch (error) {
    await markIngestionFailed(createdRecord.data.id, error);

    return NextResponse.json(
      { error: "Failed to schedule ingestion task." },
      { status: 500 },
    );
  }

  const successResponse: IngestResponse = {
    id: createdRecord.data.id,
    url: createdRecord.data.url,
    processingStatus: createdRecord.data.processing_status,
    message: "Ingestion started.",
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

async function findContentByUrl(url: string): Promise<{
  data: { id: string; url: string; processing_status: IngestResponse["processingStatus"] } | null;
  error: string | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(CONTENT_TABLE)
    .select("id, url, processing_status")
    .eq("url", url)
    .maybeSingle();

  if (!error) {
    return { data, error: null };
  }

  if (error.code === EMPTY_RESULT_CODE) {
    return { data: null, error: null };
  }

  return { data: null, error: error.message };
}

async function createPendingRecord(url: string): Promise<{
  data: { id: string; url: string; processing_status: IngestResponse["processingStatus"] } | null;
  error: string | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(CONTENT_TABLE)
    .insert({
      url,
      processing_status: DEFAULT_PROCESSING_STATUS,
    })
    .select("id, url, processing_status")
    .single();

  if (!error) {
    return {
      data: {
        id: data.id,
        url: data.url,
        processing_status: data.processing_status,
      },
      error: null,
    };
  }

  if (error.code !== SUPABASE_UNIQUE_VIOLATION_CODE) {
    return { data: null, error: error.message };
  }

  return findContentByUrl(url);
}

async function markIngestionFailed(contentId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown Trigger.dev error";

  await supabaseAdmin
    .from(CONTENT_TABLE)
    .update({
      processing_status: "failed",
      processing_error_message: message,
    })
    .eq("id", contentId);
}
