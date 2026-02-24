import { z } from "zod";

const ENV_SCHEMA = z.object({
	NEXT_PUBLIC_SUPABASE_URL: z.url(),
	SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
	TRIGGER_SECRET_KEY: z.string().min(1),
	OPENAI_API_KEY: z.string().min(1)
});

export const env = ENV_SCHEMA.parse({
	NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
	SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
	TRIGGER_SECRET_KEY: process.env.TRIGGER_SECRET_KEY,
	OPENAI_API_KEY: process.env.OPENAI_API_KEY
});
