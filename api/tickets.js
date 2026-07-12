import { canDeleteDraft, canSeeTicket, managerFinishLabel, STATUSES, validateManager, validateWarehouse } from "./_lib/domain.js";
import { getAuthenticatedProfile, json, readJson } from "./_lib/supabase.js";

async function insertLog(supabase, profile, ticket, action, previousValue = "", newValue = "", req) {
  await supabase.from("audit_logs").insert({
    ticket_id: ticket?.id || null,
    actor_user_id: profile.id,
    action,
    brand: ticket?.brand || "",
    crm_id: ticket?.crm_id || "",
    order_number: ticket?.order_number || "",
    previous_value: previousValue,
    new_value: newValue,
    device: req?.headers?.["user-agent"] || "",
    ip_address: String(req?.headers?.["x-forwarded-for"] || "").split(",")[0] || "",
  });
}

async function saveTicket(supabase, ticket) {
  const payload = { ...ticket };
  delete payload.comments;
  delete payload.logs;

  if (!payload.crm_id && payload.status && payload.status !== STATUSES.draft) {
    const { data: crmId, error: crmError } = await supabase.rpc("next_crm_id", { target_brand: payload.brand });
    if (crmError) throw crmError;
    payload.crm_id = crmId;
  }

  if (payload.id) {
    const { data, error } = await supabase.from("tickets").upsert(payload).select("*").single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase.from("tickets").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

async function findDuplicateOrder(supabase, ticket) {
  const orderNumber = String(ticket.order_number || "").trim();
  if (!orderNumber) return null;

  let query = supabase
    .from("tickets")
    .select("id, crm_id, order_number, brand, status")
    .eq("order_number", orderNumber)
    .neq("status", STATUSES.deleted)
    .limit(1);

  if (ticket.id) query = query.neq("id", ticket.id);
  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] || null;
}

function duplicateOrderError(duplicate) {
  if (!duplicate) return "";
  return `Схожа заявка вже існує: ${duplicate.crm_id || "чернетка"} · №${duplicate.order_number} · ${duplicate.brand} · ${duplicate.status}`;
}

export default async function handler(req, res) {
  try {
    const { profile, supabase } = await getAuthenticatedProfile(req);

    if (req.method === "GET") {
      const { data, error } = await supabase.from("tickets").select("*").order("updated_at", { ascending: false });
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { tickets: (data || []).filter((ticket) => canSeeTicket(profile, ticket)) });
    }

    const body = await readJson(req);
    const action = body.action || "";
    const ticket = body.ticket || {};

    if (action === "saveDraft") {
      const duplicate = await findDuplicateOrder(supabase, ticket);
      if (duplicate) return json(res, 400, { error: duplicateOrderError(duplicate) });
      const saved = await saveTicket(supabase, {
        ...ticket,
        status: STATUSES.draft,
        updated_by: profile.id,
        warehouse_user_id: ticket.warehouse_user_id || profile.id,
      });
      await insertLog(supabase, profile, saved, "збережено чернетку", body.previousValue || "", body.newValue || "");
      return json(res, 200, { ticket: saved });
    }

    if (action === "submitWarehouseDraft") {
      const errors = validateWarehouse(ticket, false);
      if (errors.length) return json(res, 400, { errors });
      const duplicate = await findDuplicateOrder(supabase, ticket);
      if (duplicate) return json(res, 400, { error: duplicateOrderError(duplicate) });
      const saved = await saveTicket(supabase, {
        ...ticket,
        status: STATUSES.fresh,
        rework_target: "",
        updated_by: profile.id,
        warehouse_user_id: ticket.warehouse_user_id || profile.id,
      });
      await insertLog(supabase, profile, saved, "передано менеджеру", STATUSES.draft, STATUSES.fresh);
      return json(res, 200, { ticket: saved });
    }

    if (action === "saveTicket") {
      const saved = await saveTicket(supabase, {
        ...ticket,
        updated_by: profile.id,
      });
      await insertLog(supabase, profile, saved, "збережено зміни", body.previousValue || "", body.newValue || "");
      return json(res, 200, { ticket: saved });
    }

    if (action === "managerSubmit") {
      const errors = validateManager(ticket);
      if (errors.length) return json(res, 400, { errors });
      const nextStatus = managerFinishLabel(ticket);
      const saved = await saveTicket(supabase, {
        ...ticket,
        status: nextStatus,
        rework_target: "",
        manager_user_id: ticket.manager_user_id || profile.id,
        updated_by: profile.id,
      });
      await insertLog(supabase, profile, saved, "змінено статус", ticket.status, nextStatus);
      return json(res, 200, { ticket: saved });
    }

    if (action === "headApprove") {
      const saved = await saveTicket(supabase, {
        ...ticket,
        status: STATUSES.money,
        rework_target: "",
        reviewer_user_id: profile.id,
        updated_by: profile.id,
      });
      await insertLog(supabase, profile, saved, "подано на повернення", ticket.status, STATUSES.money);
      return json(res, 200, { ticket: saved });
    }

    if (action === "headRework") {
      const reworkTarget = body.reworkTarget || ticket.rework_target || "office";
      const saved = await saveTicket(supabase, {
        ...ticket,
        status: STATUSES.rework,
        rework_target: reworkTarget,
        reviewer_user_id: ["head", "admin", "accountant"].includes(profile.role) ? profile.id : ticket.reviewer_user_id,
        manager_user_id: profile.role === "manager" ? profile.id : ticket.manager_user_id,
        updated_by: profile.id,
      });
      if (body.comment) {
        await supabase.from("ticket_comments").insert({
          ticket_id: saved.id,
          comment_type: "rework",
          body: body.comment,
          author_user_id: profile.id,
        });
      }
      await insertLog(supabase, profile, saved, "відправлено на доопрацювання", ticket.status, body.comment || "");
      return json(res, 200, { ticket: saved });
    }

    if (action === "deleteTicket") {
      if (profile.role !== "admin") return json(res, 403, { error: "Forbidden" });
      const saved = await saveTicket(supabase, {
        ...ticket,
        status: STATUSES.deleted,
        rework_target: "",
        updated_by: profile.id,
      });
      if (body.comment) {
        await supabase.from("ticket_comments").insert({
          ticket_id: saved.id,
          comment_type: "delete",
          body: body.comment,
          author_user_id: profile.id,
        });
      }
      await insertLog(supabase, profile, saved, "видалено заявку", ticket.status, body.comment || "");
      return json(res, 200, { ticket: saved });
    }

    if (action === "headReject") {
      const saved = await saveTicket(supabase, {
        ...ticket,
        status: STATUSES.rejected,
        rework_target: "",
        reviewer_user_id: profile.id,
        updated_by: profile.id,
      });
      if (body.comment) {
        await supabase.from("ticket_comments").insert({
          ticket_id: saved.id,
          comment_type: "reject",
          body: body.comment,
          author_user_id: profile.id,
        });
      }
      await insertLog(supabase, profile, saved, "відхилено заявку", ticket.status, body.comment || "");
      return json(res, 200, { ticket: saved });
    }

    if (action === "markPaid") {
      const saved = await saveTicket(supabase, {
        ...ticket,
        status: STATUSES.paid,
        rework_target: "",
        accountant_user_id: profile.id,
        paid_at: new Date().toISOString(),
        updated_by: profile.id,
      });
      await insertLog(supabase, profile, saved, "проведено повернення коштів", ticket.status, STATUSES.paid);
      return json(res, 200, { ticket: saved });
    }

    if (action === "deleteDraft") {
      if (!canDeleteDraft(profile, ticket)) return json(res, 403, { error: "Forbidden" });
      const { error } = await supabase.from("tickets").delete().eq("id", ticket.id);
      if (error) return json(res, 400, { error: error.message });
      await insertLog(supabase, profile, ticket, "видалено чернетку", ticket.status, "");
      return json(res, 200, { ok: true });
    }

    if (action === "addComment") {
      const { data, error } = await supabase
        .from("ticket_comments")
        .insert({
          ticket_id: ticket.id,
          comment_type: body.commentType || "comment",
          body: body.comment,
          author_user_id: profile.id,
        })
        .select("*")
        .single();
      if (error) return json(res, 400, { error: error.message });
      await insertLog(supabase, profile, ticket, "додано коментар", "", body.comment || "");
      return json(res, 201, { comment: data });
    }

    return json(res, 400, { error: "Unknown action" });
  } catch (error) {
    return json(res, 500, { error: error.message || "Internal error" });
  }
}
