
import { createClient } from "@supabase/supabase-js";

// Only Vite vars are available in a Vite build.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_SERVICE_KEY; // you said you want service key

if (!url || !key) {
  console.error("[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_KEY");
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
