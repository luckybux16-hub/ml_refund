import { getAuthenticatedProfile, json, readJson } from "./_lib/supabase.js";

function requireAdmin(profile) {
  if (profile.role !== "admin") throw new Error("Forbidden");
}

function directoryTable(key) {
  if (key === "fops") return "directory_fops";
  if (key === "reasons") return "directory_reasons";
  throw new Error("Unknown directory");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const { profile, supabase } = await getAuthenticatedProfile(req);
    requireAdmin(profile);
    const body = await readJson(req);
    const name = String(body.name || "").trim();
    if (!name) return json(res, 400, { error: "Name is required" });

    if (body.action === "add") {
      const table = directoryTable(body.key);
      const payload = table === "directory_reasons"
        ? { name, reason_type: "regular", is_active: true }
        : { name, is_active: true };
      const { error } = await supabase.from(table).upsert(payload, { onConflict: "name" });
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { ok: true });
    }

    if (body.action === "remove") {
      const table = directoryTable(body.key);
      const { error } = await supabase.from(table).update({ is_active: false }).eq("name", name);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { ok: true });
    }

    if (body.action === "updateFopIban") {
      const payerIban = String(body.payerIban || "").trim().toUpperCase();
      if (payerIban && !/^UA[A-Z0-9]{27}$/.test(payerIban)) {
        return json(res, 400, { error: "Invalid payer IBAN" });
      }
      const { error } = await supabase.from("directory_fops").update({ payer_iban: payerIban }).eq("name", name);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: "Unknown action" });
  } catch (error) {
    return json(res, error.message === "Forbidden" ? 403 : 401, { error: error.message || "Unauthorized" });
  }
}
