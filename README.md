# Content Ingestion Service

Asynchronous content ingestion service for a CMS, built with Next.js App Router, Trigger.dev background tasks, Supabase Postgres, and Vercel AI SDK.

## What this service does

- Accepts a URL via `POST /api/ingest`.
- Stores/updates ingestion records in Supabase.
- Extracts article content (title, body, author, publish date) in a background task.
- Classifies the content and generates a summary using an LLM.
- Persists AI metadata (category, summary, confidence, review flag).
- Exposes `GET /api/content` with basic filtering.
- Provides a simple UI on `/` for submission and browsing results.

## Architecture

### High-level flow

1. Client calls `POST /api/ingest` with `{ url }`.
2. API validates payload and checks if URL already exists.
3. API creates/updates DB record and triggers `ingest-content` task.
4. Parent task `ingest-content` orchestrates child tasks:
   - `extract-content` (content extraction)
   - `classify-content` (LLM classification + summary)
5. Parent task writes final result to DB and updates `processing_status`.
6. Client reads records through `GET /api/content` or via the UI.

<img width="2124" height="923" alt="Screenshot 2026-02-24 at 13 48 50" src="https://github.com/user-attachments/assets/75d4b189-a19f-4be0-a076-371314019c07" />

### Trigger.dev task structure

- **Parent task**: `ingest-content`
  - updates status to `processing`
  - invokes child tasks with `triggerAndWait`
  - stores final result as `completed` or marks `failed`
- **Child task**: `extract-content`
  - fetches URL HTML with `axios`
  - parses/extracts title/body/author/publishDate
- **Child task**: `classify-content`
  - builds prompt from extracted content
  - calls LLM via Vercel AI SDK
  - validates output with Zod schema
  - retries using Trigger `retry.onThrow`

### Idempotency strategy

To prevent duplicate child runs when the parent retries, parent task uses Trigger idempotency keys for each child invocation:

- extraction key prefix + content ID
- classification key prefix + content ID

This ensures retries reuse the same child run handle instead of creating duplicates.

## Technology Stack

- **Runtime & Language**: Node.js, TypeScript
- **Web**: Next.js (App Router), React 19
- **Validation**: Zod
- **Background jobs**: Trigger.dev SDK v4
- **Database**: Supabase (PostgreSQL)
- **LLM**: Vercel AI SDK (`ai`) + provider SDK (`@ai-sdk/google`)
- **HTTP fetch**: Axios
- **HTML parsing**: `cherio`
- **Styling/UI**: Tailwind CSS

## Project Structure

```txt
app/
  api/
    ingest/route.ts        # URL ingestion endpoint
    content/route.ts       # content listing endpoint
  page.tsx                 # simple UI

src/
  trigger/
    ingest-content.ts      # parent orchestration task
    extract-content.ts     # child extraction task
    classify-content.ts    # child classification task
  prompts/
    content-classification-prompt.ts
  utils/
    content-extraction.ts
    classify-content.ts

lib/
  schemas/content.ts
  supabase/supabase-admin.ts
  constants.ts

supabase/
  migrations/20260224113000_create_content_table.sql
```

## Environment Variables

Create `.env` (or `.env.local`) using `template.env`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=""
SUPABASE_SERVICE_ROLE_KEY=""

# Trigger.dev
TRIGGER_SECRET_KEY=""

# LLM
OPENAI_API_KEY="" # keep if needed by your configuration
GOOGLE_GENERATIVE_AI_API_KEY="" # required for @ai-sdk/google
```

> If you use only Google models in `classify-content`, set `GOOGLE_GENERATIVE_AI_API_KEY`.
> If you switch back to OpenAI provider, ensure `OPENAI_API_KEY` is set and provider code is aligned.

## Local Setup (Comprehensive)

### 0) Prerequisites

- Node.js 20+
- pnpm
- Supabase CLI
- Trigger.dev account + project configured in `trigger.config.ts`

### 1) Install dependencies

```bash
pnpm install
```

### 2) Start Supabase local stack

```bash
pnpm supabase:start
```

### 3) Apply database migrations

```bash
pnpm supabase db reset
```

### 4) Trigger.dev authentication (required before worker dev mode)

Use Trigger CLI login first:

```bash
pnpm dlx trigger.dev@latest login
```

Then start task worker (separate terminal):

```bash
pnpm dlx trigger.dev@latest dev
```

Trigger quick start reference: [Trigger.dev Quick start](https://trigger.dev/docs/quick-start)

### 5) Start Next.js app (another terminal)

```bash
pnpm dev
```

### 6) Open app

- Web UI: `http://localhost:3000`
- Submit URL in form and watch status transitions.

## Running in parallel terminals

You should have 3 terminals running:

1. **Supabase**: `pnpm supabase:start`
2. **Trigger worker**: `pnpm dlx trigger.dev@latest dev`
3. **Next.js app**: `pnpm dev`

## API Reference

## `POST /api/ingest`

Body:

```json
{
  "url": "https://example.com/article"
}
```

Response behavior:

- `202`: ingestion started (new record)
- `202`: existing failed record reset to `pending` and retriggered
- `409`: URL already exists with non-failed status
- `400`: invalid payload
- `500`: scheduling failure

## `GET /api/content`

Query params:

- `category` (optional)
- `processingStatus` (optional: `pending|processing|completed|failed`)
- `limit` (optional, default 20, max 100)

Example:

```bash
curl "http://localhost:3000/api/content?processingStatus=completed&limit=20"
```

## Database Schema Notes

Migration file: `supabase/migrations/20260224113000_create_content_table.sql`

Includes:

- enum: `content_processing_status`
- `content` table with extraction + AI fields
- `metadata jsonb` column
- status/error tracking columns
- `created_at`, `updated_at`
- indexes for category/status/created_at

## Troubleshooting

- **Trigger worker cannot import tasks**
  - ensure all task files are under `src/trigger` (configured in `trigger.config.ts`)
  - rerun `pnpm dlx trigger.dev@latest dev`
- **No task runs appear**
  - confirm CLI login and project selection
  - verify `trigger.config.ts` `project` id
- **Supabase query errors**
  - run `pnpm supabase db reset` again
  - verify env vars match local/remote target
- **LLM failures**
  - verify provider API key is present
  - check Trigger run logs for schema validation or provider errors

## Useful Commands

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm format
```
