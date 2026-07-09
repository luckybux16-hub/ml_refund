export const STATUSES = {
  draft: "Чернетка",
  fresh: "Нове повернення",
  review: "На перевірку",
  money: "Повернення коштів",
  paid: "Повернення здійснено ✅",
  rework: "На доопрацювання",
  doneNoRefund: "Завершено без повернення",
  rejected: "Відхилено ❌",
};

export function isFinalStatus(status) {
  return [STATUSES.paid, STATUSES.doneNoRefund, STATUSES.rejected].includes(status);
}

export function isPreShipmentRefusal(ticket) {
  return ticket.type === "Відмова до відправки";
}

export function managerNeedsFullPayment(ticket) {
  return ticket.type === "Повернення" || isPreShipmentRefusal(ticket) || (ticket.type === "Обмін" && ticket.exchange_result === "Наше повернення різниці");
}

export function needsPaymentDetails(ticket) {
  if (ticket.payment_method === "Оплата на сайті") return false;
  return managerNeedsFullPayment(ticket);
}

export function needsMainCrmReturnStatus(ticket) {
  return managerNeedsFullPayment(ticket) && !isPreShipmentRefusal(ticket);
}

export function canSeeTicket(profile, ticket) {
  if (profile.role === "admin") return true;
  if (!profile.brands.includes(ticket.brand)) return false;
  if (profile.role === "head") return true;
  if (profile.role === "warehouse") return ticket.warehouse_user_id === profile.id || ticket.status === STATUSES.rework;
  if (profile.role === "manager") return [STATUSES.fresh, STATUSES.rework].includes(ticket.status) || ticket.manager_user_id === profile.id;
  if (profile.role === "accountant") return [STATUSES.money, STATUSES.paid].includes(ticket.status);
  return false;
}

export function canDeleteDraft(profile, ticket) {
  if (ticket.status !== STATUSES.draft) return false;
  if (["admin", "head"].includes(profile.role)) return true;
  return [ticket.warehouse_user_id, ticket.manager_user_id, ticket.reviewer_user_id, ticket.accountant_user_id, ticket.updated_by].includes(profile.id);
}

export function managerFinishLabel(ticket) {
  if (ticket.type === "Відмова на пошті") return STATUSES.doneNoRefund;
  if (ticket.type === "Обмін" && ["Доплата клієнта", "Без доплат"].includes(ticket.exchange_result)) return STATUSES.doneNoRefund;
  return STATUSES.review;
}

export function validateWarehouse(ticket, draft = false) {
  const errors = [];
  const need = (value, label) => {
    if (!value) errors.push(label);
  };

  ["brand", "type", "order_number", "warehouse_fop", "returned_product"].forEach((key) => need(ticket[key], key));
  if (!["Відмова на пошті", "Відмова до відправки", "Обмін"].includes(ticket.type) && !Number(ticket.return_amount || 0)) {
    errors.push("return_amount");
  }
  if (!draft && ticket.type !== "Відмова до відправки" && !ticket.photo_sent) {
    errors.push("photo_sent");
  }
  return errors;
}

export function validateManager(ticket) {
  const errors = [];
  const need = (value, label) => {
    if (!value) errors.push(label);
  };

  need(ticket.manager_fop, "manager_fop");
  need(ticket.client_name, "client_name");
  need(ticket.reason, "reason");
  if (ticket.reason === "Інше") need(ticket.other_reason_comment, "other_reason_comment");
  if (ticket.type === "Відмова на пошті") return errors;

  need(ticket.order_date, "order_date");
  need(ticket.order_time, "order_time");
  if (isPreShipmentRefusal(ticket)) {
    need(ticket.payment_method, "payment_method");
    if (!Number(ticket.return_amount || 0)) errors.push("return_amount");
    if (!ticket.stock_offer_confirmed) errors.push("stock_offer_confirmed");
  }

  if (ticket.type === "Обмін") {
    need(ticket.new_product, "new_product");
    need(ticket.new_product_price, "new_product_price");
    need(ticket.exchange_result, "exchange_result");
    if (ticket.exchange_result === "Доплата клієнта") need(ticket.client_extra_payment, "client_extra_payment");
    if (ticket.exchange_result === "Наше повернення різниці") need(ticket.exchange_refund_amount, "exchange_refund_amount");
    if (ticket.exchange_result === "Без доплат") return errors;
  }

  if (ticket.type !== "Відмова на пошті") {
    need(ticket.payment_method, "payment_method");
  }

  if (needsPaymentDetails(ticket)) {
    need(ticket.iban, "iban");
    need(ticket.tax_id, "tax_id");
    need(ticket.receiver_name, "receiver_name");
  }

  if (needsMainCrmReturnStatus(ticket) && !ticket.main_crm_return_status) {
    errors.push("main_crm_return_status");
  }

  return errors;
}
