import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const allowedOrigins = new Set([
  "https://kythuat.nasun.workers.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const headersFor = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://kythuat.nasun.workers.dev",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-application-name, x-retry-count",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
});

function respond(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: headersFor(origin) });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headersFor(origin) });
  if (request.method !== "POST") return respond(405, { error: "METHOD_NOT_ALLOWED" }, origin);
  if (!origin || !allowedOrigins.has(origin)) return respond(403, { error: "ORIGIN_NOT_ALLOWED" }, origin);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("[password-recovery] Required Supabase environment is missing");
    return respond(503, { error: "RECOVERY_UNAVAILABLE" }, origin);
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return respond(401, { error: "AUTH_REQUIRED" }, origin);

  try {
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return respond(401, { error: "RECOVERY_SESSION_INVALID" }, origin);

    const claims = claimsData.claims as Record<string, unknown>;
    const userId = typeof claims.sub === "string" ? claims.sub : "";
    const issuedAt = typeof claims.iat === "number" ? claims.iat : 0;
    const methods = Array.isArray(claims.amr) ? claims.amr as Array<Record<string, unknown>> : [];
    const verifiedEmailOtp = methods.some(method => method?.method === "otp");
    const ageSeconds = Math.floor(Date.now() / 1000) - issuedAt;
    if (!userId || claims.aud !== "authenticated" || claims.aal !== "aal1" || !verifiedEmailOtp || ageSeconds < 0 || ageSeconds > 600) {
      return respond(403, { error: "EMAIL_RECOVERY_PROOF_REQUIRED" }, origin);
    }

    const { password } = await request.json();
    if (typeof password !== "string" || password.length < 12 || password.length > 128 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      return respond(400, { error: "WEAK_PASSWORD" }, origin);
    }

    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user || user.id !== userId || !user.email || !user.email_confirmed_at) {
      return respond(401, { error: "RECOVERY_SESSION_INVALID" }, origin);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, { password });
    if (updateError) {
      console.error("[password-recovery] Admin password update failed", { code: updateError.code, status: updateError.status });
      return respond(500, { error: "PASSWORD_UPDATE_FAILED" }, origin);
    }
    return respond(200, { success: true }, origin);
  } catch (error) {
    console.error("[password-recovery] Request failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return respond(400, { error: "INVALID_RECOVERY_REQUEST" }, origin);
  }
});

