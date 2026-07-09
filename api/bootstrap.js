import { getAuthenticatedProfile, json } from "./_lib/supabase.js";

function canSeeTicket(profile, ticket) {
  if (profile.role === "admin") return true;
  if (!profile.brands.includes(ticket.brand)) return false;
  if (profile.role === "head") return true;
  if (profile.role === "warehouse") return ticket.warehouse_user_id === profile.id || ticket.status === "На доопрацювання";
  if (profile.role === "manager") return ["Нове повернення", "На доопрацювання"].includes(ticket.status) || ticket.manager_user_id === profile.id;
  if (profile.role === "accountant") return ["Повернення коштів", "Повернення здійснено ✅"].includes(ticket.status);
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  try {
    const { profile, supabase } = await getAuthenticatedProfile(req);

    const [{ data: fops }, { data: reasons }, { data: users }, { data: tickets }, { data: logs }] = await Promise.all([
      supabase.from("directory_fops").select("*").eq("is_active", true).order("position", { ascending: true }),
      supabase.from("directory_reasons").select("*").eq("is_active", true).order("position", { ascending: true }),
      profile.role === "admin" ? supabase.from("app_users").select("*").order("created_at", { ascending: true }) : Promise.resolve({ data: [] }),
      supabase.from("tickets").select("*").order("updated_at", { ascending: false }),
      profile.role === "admin"
        ? supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200)
        : Promise.resolve({ data: [] }),
    ]);

    return json(res, 200, {
      currentUser: profile,
      fops: fops || [],
      reasons: reasons || [],
      users: users || [],
      tickets: (tickets || []).filter((ticket) => canSeeTicket(profile, ticket)),
      logs: logs || [],
    });
  } catch (error) {
    return json(res, 401, { error: error.message || "Unauthorized" });
  }
}
