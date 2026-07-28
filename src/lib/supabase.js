/**
 * Supabase Client – Paint Tinting & Stock Manager v2.0
 * Uses env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 * Falls back gracefully when not configured (local dev with mock data).
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Return null client when env vars not set (local mock-data mode)
export const isSupabaseConfigured =
  Boolean(
    supabaseUrl && supabaseAnonKey &&
    supabaseUrl.includes('.supabase.co') &&
    (supabaseAnonKey.startsWith('eyJ') || supabaseAnonKey.startsWith('sb_publishable_'))
  );

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'paint-tinting-auth',
      },
      global: {
        headers: {
          'x-application-name': 'paint-tinting-manager',
        },
      },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    })
  : null;

/**
 * Safe Supabase query wrapper – logs errors, never swallows them silently.
 * @param {Function} queryFn – async function returning a Supabase query
 * @param {string} context – description for error log
 */
export async function safeQuery(queryFn, context = 'unknown') {
  if (!supabase) {
    console.warn(`[Supabase] Not configured – skipping query: ${context}`);
    return { data: null, error: new Error('Supabase not configured') };
  }
  try {
    const result = await queryFn(supabase);
    if (result.error) {
      console.error(`[Supabase][${context}] Query error:`, result.error.message);
    }
    return result;
  } catch (err) {
    console.error(`[Supabase][${context}] Unexpected error:`, err.message);
    return { data: null, error: err };
  }
}
