# Content Ingestion Service

Small asynchronous content ingestion service built with Next.js App Router, Trigger.dev, Supabase (Postgres), Zod, and Vercel AI SDK.

## Features

- `POST /api/ingest` accepts a URL and schedules a background ingestion task.
- Trigger.dev task fetches and extracts article content (title, body text, author, publish date).
- LLM classification and summary generation with retry logic and confidence scoring.
- Supabase persistence with processing lifecycle states (`pending`, `processing`, `completed`, `failed`).
- `GET /api/content` returns stored records with basic filtering by category and processing status.

## Architecture

1. API route validates input with Zod.
2. URL is inserted into `content` table with `processing_status = pending`.
3. Trigger.dev background task runs ingestion pipeline.
4. Task updates record to `processing`, then `completed` (or `failed`).
5. GET endpoint reads records with filters.

## Tech Stack

- TypeScript
- Next.js (App Router)
- Zod
- Trigger.dev
- Supabase/Postgres
- Vercel AI SDK + OpenAI
- Axios
- JSDOM + Readability

## Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
TRIGGER_SECRET_KEY=your_trigger_secret_key
OPENAI_API_KEY=your_openai_api_key
```

## Local Setup

1. Install dependencies:

```bash
pnpm install
```

2. Start Supabase locally:

```bash
supabase start
```

3. Apply database migration:

```bash
supabase db reset
```

4. Start Next.js app:

```bash
pnpm dev
```

5. In a separate terminal, run Trigger.dev dev worker:

```bash
npx trigger.dev@latest dev
```

## Database Schema

Migration file:

- `supabase/migrations/20260224113000_create_content_table.sql`

Includes:

- enum type `content_processing_status`
- `content` table for source + AI metadata
- index on category, processing status, and created date
- automatic `updated_at` trigger

## API Reference

### `POST /api/ingest`

Request body:

```json
{
  "url": "https://example.com/article"
}
```

Success response (`202`):

```json
{
  "id": "uuid",
  "url": "https://example.com/article",
  "processingStatus": "pending",
  "message": "Ingestion started."
}
```

### `GET /api/content`

Query params:

- `category` (optional)
- `processingStatus` (optional): `pending|processing|completed|failed`
- `limit` (optional, default 20, max 100)

Example:

```bash
curl "http://localhost:3000/api/content?category=technology&processingStatus=completed&limit=10"
```

## Error Handling

- Invalid POST payload returns `400`.
- Duplicate URLs return existing record (`200`) instead of creating duplicates.
- Fetch/extraction/LLM failures set `processing_status = failed`.
- Failure details are persisted in `processing_error_message`.
- LLM retries use exponential backoff (up to 3 attempts).

## Submission Write-up Template (5-10 sentences)

I built a content ingestion pipeline with Next.js App Router, Trigger.dev, Supabase, Zod, and Vercel AI SDK.  
I used AI assistance for initial architecture scaffolding and prompt drafting, then implemented the API contracts, task orchestration, extraction, retries, and persistence logic manually.  
The ingestion route only schedules work and returns quickly, while Trigger.dev handles long-running steps to avoid serverless timeout risk.  
I used Readability with JSDOM for content extraction and axios for robust HTTP handling with timeouts.  
The LLM output is schema-validated and stored with category, summary, confidence score, and `needs_review` flag.  
I added retry logic with backoff around model calls to improve reliability.  
I prioritized a resilient async pipeline and observability (`processing_status` + `processing_error_message`) over richer UI features to fit the time limit.  
As a trade-off, I kept taxonomy and ranking simple and focused on correctness of ingestion and persistence.
