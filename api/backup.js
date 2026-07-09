import { getAuthenticatedProfile } from "./_lib/supabase.js";

const TABLES = [
  "app_users",
  "directory_fops",
  "directory_reasons",
  "tickets",
  "ticket_comments",
  "audit_logs",
  "crm_counters",
];

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  try {
    const { profile, supabase } = await getAuthenticatedProfile(req);
    if (profile.role !== "admin") {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }

    const backup = {
      exportedAt: new Date().toISOString(),
      exportedBy: {
        id: profile.id,
        login: profile.login,
        role: profile.role,
      },
      tables: {},
    };

    for (const table of TABLES) {
      const { data, error } = await supabase.from(table).select("*");
      if (error) throw error;
      backup.tables[table] = data || [];
    }

    const date = new Date().toISOString().slice(0, 10);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="crm-backup-${date}.json"`);
    res.end(JSON.stringify(backup, null, 2));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: error.message || "Backup failed" }));
  }
}
