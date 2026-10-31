/**
 * Supabase Client – Paint Tinting & Stock Manager v2.0
 * Uses env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 * Falls back gracefully when not configured (local dev with mock data).
 */
import { createClient } from '@supabase/supabase-js';
import { secureAuthStorage } from '../security/authRuntime.js';
import { createSupabaseFetch, validateSupabaseEndpoint } from '../security/networkPolicy.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let validatedSupabaseUrl = null;
try {
  if (supabaseUrl) validatedSupabaseUrl = validateSupabaseEndpoint(supabaseUrl);
} catch (error) {
  console.error('[Security] Supabase endpoint rejected:', error.message);
}

// Return null client when env vars are missing or fail the network policy.
export const isSupabaseConfigured =
  Boolean(
    validatedSupabaseUrl && supabaseAnonKey &&
    (supabaseAnonKey.startsWith('eyJ') || supabaseAnonKey.startsWith('sb_publishable_'))
  );
export const isDevelopmentFallback = import.meta.env.DEV && !isSupabaseConfigured;

export const supabase = isSupabaseConfigured
  ? createClient(validatedSupabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storage: secureAuthStorage,
        storageKey: 'paint-tinting-auth',
      },
      global: {
        fetch: createSupabaseFetch(validatedSupabaseUrl),
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
    const timeoutMs = 15000;
    let timeoutId;
    const timeoutPromise = new Promise(resolve => {
      timeoutId = window.setTimeout(() => resolve({
        data: null,
        error: Object.assign(new Error(`Yêu cầu Supabase quá thời gian ${timeoutMs / 1000} giây`), { code: 'QUERY_TIMEOUT' })
      }), timeoutMs);
    });
    const result = await Promise.race([Promise.resolve(queryFn(supabase)), timeoutPromise]);
    window.clearTimeout(timeoutId);
    if (result.error) {
      console.error(`[Supabase][${context}] Query error:`, result.error.message);
    }
    return result;
  } catch (err) {
    console.error(`[Supabase][${context}] Unexpected error:`, err.message);
    return { data: null, error: err };
  }
}
