import { NextResponse } from "next/server";

import { DEFAULT_PAGE_LIMIT } from "@/lib/constants";
import { ContentFilterSchema } from "@/lib/schemas/content";
import { supabaseAdmin } from "@/lib/supabase/supabase-admin";

interface ContentListItem {
	id: string;
	url: string;
	title: string | null;
	author: string | null;
	publish_date: string | null;
	summary: string | null;
	category: string | null;
	confidence_score: number | null;
	needs_review: boolean;
	processing_status: "pending" | "processing" | "completed" | "failed";
	processing_error_message: string | null;
	created_at: string;
}

export async function GET(request: Request): Promise<NextResponse> {
	const { searchParams } = new URL(request.url);
	const parsedFilters = ContentFilterSchema.safeParse({
		category: searchParams.get("category") ?? undefined,
		processingStatus: searchParams.get("processingStatus") ?? undefined,
		limit: searchParams.get("limit") ?? DEFAULT_PAGE_LIMIT
	});

	if (!parsedFilters.success) {
		return NextResponse.json(
			{ error: "Invalid query parameters.", details: parsedFilters.error.issues },
			{ status: 400 }
		);
	}

	try {
		const records = await getContentRecords(parsedFilters.data);

		return NextResponse.json(
			{
				data: records,
				count: records.length
			},
			{ status: 200 }
		);
	} catch (error) {
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Failed to fetch ingested content records."
			},
			{ status: 500 }
		);
	}
}

interface ContentFilterInput {
	category?: string;
	processingStatus?: "pending" | "processing" | "completed" | "failed";
	limit: number;
}

async function getContentRecords(filters: ContentFilterInput): Promise<ContentListItem[]> {
	let query = supabaseAdmin
		.from("content")
		.select(
			"id, url, title, author, publish_date, summary, category, confidence_score, needs_review, processing_status, processing_error_message, created_at"
		)
		.order("created_at", { ascending: false })
		.limit(filters.limit);

	if (filters.category) {
		query = query.eq("category", filters.category);
	}

	if (filters.processingStatus) {
		query = query.eq("processing_status", filters.processingStatus);
	}

	const { data, error } = await query;
	if (error) {
		throw new Error(`Failed to fetch content records: ${error.message}`);
	}

	return data;
}
