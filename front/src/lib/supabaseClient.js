import { createClient } from "@supabase/supabase-js";

const url =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
const anon =
  import.meta.env.VITE_SUPABASE_SERVICE_KEY || import.meta.env.SUPABASE_SERVICE_KEY;

if (!url || !anon) {
  console.error("Missing Supabase env. Put VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_KEY in front/.env");
}

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
