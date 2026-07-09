import { createClient } from "@supabase/supabase-js";

const required = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function assertEnv() {
  required.forEach(getEnv);
}

export function createServiceClient() {
  assertEnv();
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createPublicClient() {
  assertEnv();
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_PUBLISHABLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function loginToEmail(login) {
  const domain = process.env.APP_EMAIL_DOMAIN || "crm.local";
  return `${String(login || "").trim()}@${domain}`;
}

export function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export async function getAuthenticatedProfile(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw new Error("Missing bearer token");

  const supabase = createServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) throw new Error("Invalid auth token");

  const { data: profile, error: profileError } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile) throw new Error("Missing user profile");
  if (!profile.active) throw new Error("User is inactive");

  return {
    token,
    authUser: userData.user,
    profile,
    supabase,
  };
}
