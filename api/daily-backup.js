import { createServiceClient, json } from "./_lib/supabase.js";

const TABLES = [
  "app_users",
  "directory_fops",
  "directory_reasons",
  "tickets",
  "ticket_comments",
  "audit_logs",
  "login_events",
  "crm_counters",
];

async function buildBackup(supabase, source) {
  const backup = {
    exportedAt: new Date().toISOString(),
    source,
    tables: {},
  };

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) throw error;
    backup.tables[table] = data || [];
  }

  return backup;
}

async function ensureBucket(supabase) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;
  if ((buckets || []).some((bucket) => bucket.name === "crm-backups")) return;

  const { error } = await supabase.storage.createBucket("crm-backups", {
    public: false,
    fileSizeLimit: 10485760,
  });
  if (error) throw error;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const secret = process.env.CRON_SECRET || "";
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!secret || token !== secret) return json(res, 401, { error: "Unauthorized" });

  try {
    const supabase = createServiceClient();
    await ensureBucket(supabase);

    const backup = await buildBackup(supabase, "vercel-cron");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `daily/crm-backup-${stamp}.json`;
    const body = JSON.stringify(backup, null, 2);

    const { error } = await supabase.storage
      .from("crm-backups")
      .upload(path, body, {
        contentType: "application/json; charset=utf-8",
        upsert: false,
      });
    if (error) throw error;

    return json(res, 200, { ok: true, path });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || "Daily backup failed" });
  }
}
