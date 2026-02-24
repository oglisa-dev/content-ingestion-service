import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

export interface ContentInsertRecord {
  id?: string;
  url: string;
  processing_status: "pending" | "processing" | "completed" | "failed";
}

export interface ContentStoredRecord extends ContentInsertRecord {
  id: string;
}

export const supabaseAdmin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);
