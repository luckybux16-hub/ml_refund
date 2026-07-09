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
      supabase.from("app_users").select("id, login, name, role, brands, active, created_at, updated_at").order("created_at", { ascending: true }),
      supabase.from("tickets").select("*").order("updated_at", { ascending: false }),
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(500),
    ]);
    const visibleTickets = (tickets || []).filter((ticket) => canSeeTicket(profile, ticket));
    const visibleTicketIds = visibleTickets.map((ticket) => ticket.id);
    const { data: comments } = visibleTicketIds.length
      ? await supabase
          .from("ticket_comments")
          .select("*")
          .in("ticket_id", visibleTicketIds)
          .order("created_at", { ascending: false })
      : { data: [] };

    return json(res, 200, {
      currentUser: profile,
      fops: fops || [],
      reasons: reasons || [],
      users: users || [],
      tickets: visibleTickets,
      comments: comments || [],
      logs: (logs || []).filter((log) => !log.ticket_id || visibleTicketIds.includes(log.ticket_id)),
    });
  } catch (error) {
    return json(res, 401, { error: error.message || "Unauthorized" });
  }
}
