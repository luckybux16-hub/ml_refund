import { createServiceClient, json, readJson } from "./_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const body = await readJson(req);
    const login = String(body.login || "").trim().slice(0, 120);
    if (!login) return json(res, 400, { error: "Missing login" });

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from("app_users")
      .select("id")
      .eq("login", login)
      .maybeSingle();

    const headers = req.headers || {};
    const { error } = await supabase.from("login_events").insert({
      login,
      success: Boolean(body.success),
      user_id: profile?.id || null,
      device: headers["user-agent"] || "",
      ip_address: String(headers["x-forwarded-for"] || "").split(",")[0] || "",
    });
    if (error) throw error;

    return json(res, 201, { ok: true });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || "Failed to log login event" });
  }
}
