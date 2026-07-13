const STORAGE_KEY = "moow_lexie_crm_v1";
const AUTH_TOKEN_KEY = "moow_lexie_auth_token";

const ROLES = {
  warehouse: "Склад",
  manager: "Менеджер",
  head: "Керівник",
  accountant: "Бухгалтер",
  admin: "Головний адміністратор",
};

const STATUSES = {
  draft: "Чернетка",
  new: "Нове повернення",
  review: "На перевірку",
  money: "Повернення коштів",
  paid: "Повернення здійснено ✅",
  rework: "На доопрацювання",
  doneNoRefund: "Завершено без повернення",
  rejected: "Відхилено ❌",
  deleted: "Видалено",
};

const STATUS_CLASS = {
  [STATUSES.draft]: "s-draft",
  [STATUSES.new]: "s-new",
  [STATUSES.review]: "s-review",
  [STATUSES.money]: "s-money",
  [STATUSES.paid]: "s-paid",
  [STATUSES.rework]: "s-rework",
  [STATUSES.rejected]: "s-rejected",
  [STATUSES.doneNoRefund]: "s-done",
  [STATUSES.deleted]: "s-deleted",
};

const TYPES = ["Повернення", "Відмова на пошті", "Відмова до відправки", "Обмін"];
const BRANDS = ["MOOW", "LEXIE"];
const PAYMENT_METHODS = ["Оплата на сайті", "На сайті з вирахуванням доставки", "Накладений платіж", "Повна оплата"];
const FOPS = ["ФОП Тарасова", "ФОП Левицький", "ФОП Кильницька", "ФОП Дротенко", "Оплата на сайті"];
const RETURN_REASONS = [
  "Не сподобалась якість",
  "Не підійшов розмір",
  "Не підійшов розмір (потрібен більший)",
  "Не підійшов розмір (потрібен менший)",
  "Не встигла забрати",
  "Виглядає не так як очікувала",
  "Не мій фасон",
  "Брак з вини цеху",
  "Брак",
  "Інше",
];
const PRE_SHIPMENT_REASONS = [
  "Не хоче чекати",
  "Товара немає в наявності (і не буде)",
  "Товара немає в наявності (і не хоче чекати)",
];

const ROLE_ACCENTS = {
  warehouse: "role-warehouse",
  manager: "role-manager",
  head: "role-head",
  accountant: "role-accountant",
  admin: "role-admin",
};

const DEFAULT_USERS = [
  { id: "u-admin", login: "admin", password: "123456", name: "Адміністратор", role: "admin", brands: BRANDS, active: true },
  { id: "u-sklad", login: "sklad", password: "123456", name: "Склад", role: "warehouse", brands: BRANDS, active: true },
  { id: "u-manager", login: "manager", password: "123456", name: "Менеджер", role: "manager", brands: BRANDS, active: true },
  { id: "u-head", login: "head", password: "123456", name: "Керівник", role: "head", brands: BRANDS, active: true },
  { id: "u-accountant", login: "accountant", password: "123456", name: "Бухгалтер", role: "accountant", brands: BRANDS, active: true },
];

const app = document.querySelector("#app");

let state = loadState();
let sessionUserId = localStorage.getItem("moow_lexie_session");
let authToken = localStorage.getItem(AUTH_TOKEN_KEY) || "";
let view = { page: "dashboard", selectedId: null, filter: {}, mine: false, tab: "tickets" };
let toastTimer = null;
let remoteConfigPromise = null;
let remoteClient = null;

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return normalizeState(JSON.parse(raw));
  const initial = {
    users: DEFAULT_USERS,
    fops: FOPS,
    reasons: RETURN_REASONS,
    preShipmentReasons: PRE_SHIPMENT_REASONS,
    tickets: [],
    logs: [],
    loginEvents: [],
    counters: { MOOW: 0, LEXIE: 0 },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

function normalizeState(saved) {
  saved.preShipmentReasons = saved.preShipmentReasons || PRE_SHIPMENT_REASONS;
  saved.reasons = saved.reasons || RETURN_REASONS;
  saved.fops = saved.fops || FOPS;
  saved.users = saved.users || DEFAULT_USERS;
  saved.tickets = saved.tickets || [];
  saved.logs = saved.logs || [];
  saved.loginEvents = saved.loginEvents || [];
  saved.counters = saved.counters || { MOOW: 0, LEXIE: 0 };
  saved.tickets.forEach((ticket) => {
    if (ticket.stockOfferConfirmed == null) ticket.stockOfferConfirmed = false;
  });
  return saved;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isRemoteSession() {
  return Boolean(authToken);
}

async function getRemoteConfig() {
  if (!remoteConfigPromise) {
    remoteConfigPromise = fetch("/api/config")
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }
  return remoteConfigPromise;
}

async function getRemoteClient() {
  if (remoteClient) return remoteClient;
  const config = await getRemoteConfig();
  if (!config?.supabaseUrl || !config?.supabasePublishableKey || !window.supabase?.createClient) return null;
  remoteClient = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  return remoteClient;
}

function profileToUser(profile) {
  return {
    id: profile.id,
    login: profile.login,
    password: "",
    name: profile.name,
    role: profile.role,
    brands: profile.brands || BRANDS,
    active: profile.active !== false,
  };
}

function userFromApi(user) {
  return {
    id: user.id,
    login: user.login,
    password: "",
    name: user.name,
    role: user.role,
    brands: user.brands || BRANDS,
    active: user.active !== false,
  };
}

function ticketFromApi(ticket, comments = []) {
  return {
    id: ticket.id,
    crmId: ticket.crm_id || "",
    status: ticket.status,
    brand: ticket.brand,
    type: ticket.type,
    orderNumber: ticket.order_number || "",
    warehouseFop: ticket.warehouse_fop || "",
    returnedProduct: ticket.returned_product || "",
    returnAmount: Number(ticket.return_amount || 0),
    deliveryPaid: ticket.delivery_paid || "",
    deliveryDeduction: Number(ticket.delivery_deduction || 0),
    photoSent: Boolean(ticket.photo_sent),
    warehouseComment: ticket.warehouse_comment || "",
    managerFop: ticket.manager_fop || "",
    orderDate: ticket.order_date || "",
    orderTime: ticket.order_time || "",
    clientName: ticket.client_name || "",
    reason: ticket.reason || "",
    otherReasonComment: ticket.other_reason_comment || "",
    paymentMethod: ticket.payment_method || "",
    iban: ticket.iban || "",
    taxId: ticket.tax_id || "",
    receiverName: ticket.receiver_name || "",
    paymentPurpose: ticket.payment_purpose || "",
    managerComment: ticket.manager_comment || "",
    stockOfferConfirmed: Boolean(ticket.stock_offer_confirmed),
    mainCrmReturnStatus: Boolean(ticket.main_crm_return_status),
    newProduct: ticket.new_product || "",
    newProductPrice: Number(ticket.new_product_price || 0),
    exchangeResult: ticket.exchange_result || "",
    clientExtraPayment: Number(ticket.client_extra_payment || 0),
    exchangeRefundAmount: Number(ticket.exchange_refund_amount || 0),
    checklist: ticket.checklist || {},
    comments,
    createdAt: ticket.created_at || nowIso(),
    updatedAt: ticket.updated_at || nowIso(),
    warehouseUserId: ticket.warehouse_user_id || "",
    managerUserId: ticket.manager_user_id || "",
    reviewerUserId: ticket.reviewer_user_id || "",
    accountantUserId: ticket.accountant_user_id || "",
    updatedBy: ticket.updated_by || "",
    paidAt: ticket.paid_at || "",
    reworkTarget: ticket.rework_target || "",
  };
}

function ticketToApi(ticket) {
  return {
    id: ticket.id,
    crm_id: ticket.crmId || null,
    brand: ticket.brand,
    type: ticket.type,
    status: ticket.status,
    order_number: ticket.orderNumber || "",
    warehouse_fop: ticket.warehouseFop || "",
    returned_product: ticket.returnedProduct || "",
    return_amount: Number(ticket.returnAmount || 0),
    delivery_paid: ticket.deliveryPaid || "",
    delivery_deduction: Number(ticket.deliveryDeduction || 0),
    photo_sent: Boolean(ticket.photoSent),
    warehouse_comment: ticket.warehouseComment || "",
    manager_fop: ticket.managerFop || "",
    order_date: ticket.orderDate || "",
    order_time: ticket.orderTime || "",
    client_name: ticket.clientName || "",
    reason: ticket.reason || "",
    other_reason_comment: ticket.otherReasonComment || "",
    payment_method: ticket.paymentMethod || "",
    iban: ticket.iban || "",
    tax_id: ticket.taxId || "",
    receiver_name: ticket.receiverName || "",
    payment_purpose: ticket.paymentPurpose || paymentPurpose(ticket),
    manager_comment: ticket.managerComment || "",
    stock_offer_confirmed: Boolean(ticket.stockOfferConfirmed),
    main_crm_return_status: Boolean(ticket.mainCrmReturnStatus),
    new_product: ticket.newProduct || "",
    new_product_price: Number(ticket.newProductPrice || 0),
    exchange_result: ticket.exchangeResult || "",
    client_extra_payment: Number(ticket.clientExtraPayment || 0),
    exchange_refund_amount: Number(ticket.exchangeRefundAmount || 0),
    warehouse_user_id: ticket.warehouseUserId || null,
    manager_user_id: ticket.managerUserId || null,
    reviewer_user_id: ticket.reviewerUserId || null,
    accountant_user_id: ticket.accountantUserId || null,
    updated_by: ticket.updatedBy || null,
    paid_at: ticket.paidAt || null,
    rework_target: ticket.reworkTarget || "",
  };
}

function commentFromApi(comment) {
  const author = state.users.find((user) => user.id === comment.author_user_id);
  return {
    id: comment.id,
    type: comment.comment_type || "comment",
    text: comment.body || "",
    author: author?.name || "",
    at: comment.created_at || nowIso(),
  };
}

function logFromApi(log) {
  const actor = state.users.find((user) => user.id === log.actor_user_id);
  return {
    id: log.id,
    ticketId: log.ticket_id || "",
    action: log.action || "",
    previousValue: log.previous_value || "",
    newValue: log.new_value || "",
    at: log.created_at || nowIso(),
    userName: actor?.name || "",
    role: actor?.role ? ROLES[actor.role] : "",
  };
}

function loginEventFromApi(event) {
  const user = state.users.find((item) => item.id === event.user_id || item.login === event.login);
  return {
    id: event.id,
    login: event.login || "",
    success: Boolean(event.success),
    userName: user?.name || "",
    role: user?.role ? ROLES[user.role] : "",
    device: event.device || "",
    ipAddress: event.ip_address || "",
    at: event.created_at || nowIso(),
  };
}

function upsertSessionUser(profile) {
  const user = profileToUser(profile);
  const index = state.users.findIndex((item) => item.id === user.id || item.login === user.login);
  if (index >= 0) state.users[index] = { ...state.users[index], ...user };
  else state.users.push(user);
  saveState();
  return user;
}

async function loginWithSupabase(loginValue, passwordValue) {
  const config = await getRemoteConfig();
  const client = await getRemoteClient();
  if (!client || !config?.emailDomain) return null;

  const email = `${loginValue}@${config.emailDomain}`;
  const { data, error } = await client.auth.signInWithPassword({ email, password: passwordValue });
  if (error || !data?.session?.access_token) throw new Error("Invalid remote credentials");
  authToken = data.session.access_token;
  localStorage.setItem(AUTH_TOKEN_KEY, authToken);

  const payload = await loadRemoteData();
  return upsertSessionUser(payload.currentUser);
}

async function loadRemoteData() {
  if (!authToken) return null;
  const response = await fetch("/api/bootstrap", {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
  if (!response.ok) throw new Error("Failed to load remote data");
  const payload = await response.json();
  applyRemotePayload(payload);
  return payload;
}

function applyRemotePayload(payload) {
  state.users = (payload.users || []).map(userFromApi);
  const commentGroups = {};
  (payload.comments || []).forEach((comment) => {
    const mapped = commentFromApi(comment);
    commentGroups[comment.ticket_id] = commentGroups[comment.ticket_id] || [];
    commentGroups[comment.ticket_id].push(mapped);
  });
  state.tickets = (payload.tickets || []).map((ticket) => ticketFromApi(ticket, commentGroups[ticket.id] || []));
  state.logs = (payload.logs || []).map(logFromApi);
  state.loginEvents = (payload.loginEvents || []).map(loginEventFromApi);
  state.fops = (payload.fops || []).map((item) => item.name);
  state.reasons = (payload.reasons || []).filter((item) => item.reason_type === "regular").map((item) => item.name);
  state.preShipmentReasons = (payload.reasons || []).filter((item) => item.reason_type === "pre_shipment").map((item) => item.name);
  saveState();
}

async function remoteTicketAction(action, ticket, extra = {}) {
  if (!isRemoteSession()) return null;
  const response = await fetch("/api/tickets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      action,
      ticket: ticketToApi(ticket),
      ...extra,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.errors?.join(", ") || payload.error || "Помилка збереження");
  return payload;
}

async function remoteUserRequest(method, body = {}) {
  if (!isRemoteSession()) return null;
  const response = await fetch("/api/users", {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Помилка збереження користувача");
  await loadRemoteData();
  return payload;
}

async function logLoginAttempt(loginValue, success) {
  if (!isRemoteSession() && !remoteConfigPromise) return;
  try {
    await fetch("/api/login-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: loginValue, success }),
    });
  } catch (error) {
    // Login must never fail because analytics logging failed.
  }
}

function currentUser() {
  return state.users.find((user) => user.id === sessionUserId) || null;
}

function nowIso() {
  return new Date().toISOString();
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function money(value) {
  return `${Number(value || 0).toFixed(2)} грн`;
}

function byId(id) {
  return document.getElementById(id);
}

function userName(id) {
  return id ? state.users.find((user) => user.id === id)?.name || "" : "";
}

function badge(status) {
  return `<span class="badge ${STATUS_CLASS[status] || "s-draft"}">${status}</span>`;
}

function logAction(ticket, action, previousValue = "", newValue = "") {
  const user = currentUser();
  state.logs.unshift({
    id: crypto.randomUUID(),
    at: nowIso(),
    userId: user?.id || "system",
    userName: user?.name || "Система",
    role: user ? ROLES[user.role] : "Система",
    brand: ticket?.brand || "",
    crmId: ticket?.crmId || "",
    orderNumber: ticket?.orderNumber || "",
    ticketId: ticket?.id || "",
    action,
    previousValue,
    newValue,
    device: navigator.userAgent,
  });
}

function nextCrmId(brand) {
  state.counters[brand] = (state.counters[brand] || 0) + 1;
  return `${brand}-${String(state.counters[brand]).padStart(6, "0")}`;
}

function finalAmount(ticket) {
  const base = baseRefundAmount(ticket);
  if (isPreShipmentRefusal(ticket)) return base;
  if (ticket.deliveryPaid === "Так") return base;
  return Math.max(0, base - Number(ticket.deliveryDeduction || 0));
}

function baseRefundAmount(ticket) {
  if (ticket.type === "Обмін" && ticket.exchangeResult === "Наше повернення різниці") {
    return Number(ticket.exchangeRefundAmount || 0);
  }
  return Number(ticket.returnAmount || 0);
}

function paymentPurpose(ticket) {
  if (!ticket.orderDate) return "";
  const date = formatOrderDate(ticket.orderDate);
  if (ticket.brand === "MOOW") return `Повернення коштів за замовлення від ${date}`;
  return `Повернення коштів за замовлення №${ticket.orderNumber || ""}, від ${date}`;
}

function formatOrderDate(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join(".");
  return value;
}

function hasWarehouseMoney(ticket) {
  return !["Відмова на пошті", "Відмова до відправки", "Обмін"].includes(ticket.type);
}

function usesRegularReturnReasons(ticket) {
  return ticket.type !== "Відмова до відправки";
}

function reasonListFor(ticket) {
  return usesRegularReturnReasons(ticket) ? state.reasons : (state.preShipmentReasons || PRE_SHIPMENT_REASONS);
}

function needsPaymentDetails(ticket) {
  if (ticket.paymentMethod === "Оплата на сайті") return false;
  return managerNeedsFullPayment(ticket);
}

function needsMainCrmReturnStatus(ticket) {
  return managerNeedsFullPayment(ticket) && !isPreShipmentRefusal(ticket);
}

function needsMainCrmRefusalStatus(ticket) {
  return isPreShipmentRefusal(ticket);
}

function isPreShipmentRefusal(ticket) {
  return ticket.type === "Відмова до відправки";
}

function shouldShowDeliveryMoney(ticket) {
  return hasWarehouseMoney(ticket) && ticket.deliveryPaid === "Ні";
}

function headChecks(ticket) {
  if (isPreShipmentRefusal(ticket)) {
    const checks = [
      "ФОП перевірено",
      "Спосіб оплати перевірено",
      "Сума повернення перевірена",
      "Причина перевірена",
    ];
    if (needsPaymentDetails(ticket)) checks.push("Реквізити перевірені");
    if (ticket.paymentMethod === "Накладений платіж") checks.push("Перевірити накладений платіж");
    checks.push("Товара все ще немає на складі, а якщо є — запропонована відправка");
    return checks;
  }
  const checks = [
    "ФОП перевірено",
    "Спосіб оплати перевірено",
    "Сума повернення перевірена",
    "Доставка перевірена",
    "Фінальна сума перевірена",
  ];
  if (needsPaymentDetails(ticket)) checks.push("Реквізити перевірені");
  if (ticket.paymentMethod === "Накладений платіж") checks.push("Перевірити накладений платіж");
  checks.push("Статус «Повернення товару» в основній CRM перевірено");
  return checks;
}

function canSeeTicket(user, ticket) {
  if (!user) return false;
  if (ticket.status === STATUSES.deleted) return user.role === "admin";
  if (ticket.status === STATUSES.draft) {
    if (user.role === "admin") return true;
    if (ticket.warehouseUserId === user.id || ticket.managerUserId === user.id) return true;
  }
  if (!user.brands.includes(ticket.brand)) return false;
  if (user.role === "admin") return true;
  if (user.role === "head") return true;
  if (user.role === "warehouse") {
    return ticket.warehouseUserId === user.id || (ticket.status === STATUSES.rework && ticket.reworkTarget === "warehouse");
  }
  if (user.role === "manager") {
    return [STATUSES.new].includes(ticket.status) || (ticket.status === STATUSES.rework && ticket.reworkTarget !== "warehouse") || ticket.managerUserId === user.id;
  }
  if (user.role === "accountant") {
    return [STATUSES.money, STATUSES.paid].includes(ticket.status);
  }
  return false;
}

function isFinalStatus(status) {
  return [STATUSES.paid, STATUSES.doneNoRefund, STATUSES.rejected, STATUSES.deleted].includes(status);
}

function visibleTickets() {
  const user = currentUser();
  return state.tickets.filter((ticket) => canSeeTicket(user, ticket)).filter(applyFilters);
}

function applyFilters(ticket) {
  const f = view.filter;
  if (f.search) {
    const haystack = [ticket.crmId, ticket.orderNumber, ticket.brand, ticket.type, ticket.clientName, ticket.returnedProduct].join(" ").toLowerCase();
    if (!haystack.includes(f.search.toLowerCase())) return false;
  }
  if (f.brand && ticket.brand !== f.brand) return false;
  if (f.status && ticket.status !== f.status) return false;
  if (f.type && ticket.type !== f.type) return false;
  if (f.fop && ticket.managerFop !== f.fop && ticket.warehouseFop !== f.fop) return false;
  if (f.paymentMethod && ticket.paymentMethod !== f.paymentMethod) return false;
  if (f.overdue && !isOverdueTicket(ticket)) return false;
  if (f.manager && ticket.managerUserId !== f.manager) return false;
  if (f.reason && ticket.reason !== f.reason) return false;
  if (view.mine && !isMine(ticket)) return false;
  return true;
}

function isMine(ticket) {
  const user = currentUser();
  if (user.role === "warehouse") return ticket.warehouseUserId === user.id;
  if (user.role === "manager") return ticket.managerUserId === user.id;
  if (user.role === "head") return ticket.reviewerUserId === user.id;
  if (user.role === "accountant") return ticket.accountantUserId === user.id;
  return false;
}

function setPage(page, selectedId = null) {
  view.page = page;
  view.selectedId = selectedId;
  render();
}

function runInlineAction(code, element, event) {
  return (function executeInlineAction() {
    return eval(code);
  }).call(element);
}

function hydrateInlineActions(root) {
  root.querySelectorAll("[onclick]").forEach((element) => {
    const code = element.getAttribute("onclick");
    element.removeAttribute("onclick");
    element.addEventListener("click", function handleClick(event) {
      event.preventDefault();
      runInlineAction(code, this, event);
    });
  });

  root.querySelectorAll("[onchange]").forEach((element) => {
    const code = element.getAttribute("onchange");
    element.removeAttribute("onchange");
    element.addEventListener("change", function handleChange(event) {
      runInlineAction(code, this, event);
    });
  });

  root.querySelectorAll("[oninput]").forEach((element) => {
    const code = element.getAttribute("oninput");
    element.removeAttribute("oninput");
    element.addEventListener("input", function handleInput(event) {
      runInlineAction(code, this, event);
    });
  });

  root.querySelectorAll("form[onsubmit]").forEach((element) => {
    const code = element.getAttribute("onsubmit");
    element.removeAttribute("onsubmit");
    element.addEventListener("submit", function handleSubmit(event) {
      runInlineAction(code, this, event);
    });
  });
}

function render() {
  const user = currentUser();
  if (!user) return renderLogin();
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="topbar-inner">
          <div>
            <h1 class="brand-title">MOOW / LEXIE CRM</h1>
            <div class="role-line">${user.name} · ${ROLES[user.role]} · ${user.brands.join(", ")}</div>
          </div>
          <button class="ghost" onclick="logout()">Вийти</button>
        </div>
        ${renderNav(user)}
      </header>
      <main class="page">${renderPage(user)}</main>
      <div id="toastRoot"></div>
    </div>
  `;
  hydrateInlineActions(app);
  if (view.page === "create") setTimeout(updateCreateVisibility, 0);
  if (view.page === "ticket") setTimeout(updateDraftVisibility, 0);
  setTimeout(updateBrandSelectTheme, 0);
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-wrap">
      <form class="login" onsubmit="login(event)">
        <div class="brand-lockup">
          <span class="brand-chip moow-chip">MOOW</span>
          <span class="brand-chip lexie-chip">LEXIE</span>
        </div>
        <h1>CRM повернень та обмінів</h1>
        <p>Вхід для команди складу, офісу, керівника та бухгалтерії</p>
        <div class="field">
          <label>Логін</label>
          <input id="loginInput" autocomplete="username" />
        </div>
        <div class="field">
          <label>Пароль</label>
          <input id="passwordInput" type="password" autocomplete="current-password" />
        </div>
        <div id="loginError" class="error"></div>
        <button style="width:100%; margin-top:12px">Увійти</button>
      </form>
    </div>
  `;
  hydrateInlineActions(app);
}

function renderNav(user) {
  const items = [
    ["dashboard", "Dashboard"],
    ["tickets", "Заявки"],
  ];
  if (user.role !== "manager" && user.role !== "warehouse") items.push(["stats", "Статистика"]);
  if (user.role === "admin") {
    items.push(["logins", "Входи"], ["directories", "Довідники"], ["users", "Користувачі"], ["settings", "Налаштування"]);
  }
  return `<nav class="nav">${items.map(([page, label]) => `<button class="${view.page === page ? "active" : ""}" onclick="setPage('${page}')">${label}</button>`).join("")}</nav>`;
}

function renderPage(user) {
  if (view.page === "dashboard") return renderDashboard(user);
  if (view.page === "tickets") return renderTickets(user);
  if (view.page === "create") return renderTicketForm(user);
  if (view.page === "ticket") return renderTicketDetails(user);
  if (view.page === "stats") return renderStats(user);
  if (view.page === "logins") return renderLoginEvents();
  if (view.page === "directories") return renderDirectories();
  if (view.page === "users") return renderUsers();
  if (view.page === "settings") return renderSettings();
  return "";
}

function dashboardActionableTickets(user) {
  const visible = state.tickets.filter((ticket) => canSeeTicket(user, ticket));
  if (user.role === "warehouse") {
    return visible.filter((ticket) => ticket.warehouseUserId === user.id && ticket.status === STATUSES.draft || (ticket.status === STATUSES.rework && ticket.reworkTarget === "warehouse"));
  }
  if (user.role === "manager") {
    return visible.filter((ticket) => ticket.status === STATUSES.new || (ticket.status === STATUSES.rework && ticket.reworkTarget !== "warehouse"));
  }
  if (user.role === "head") {
    return visible.filter((ticket) => [STATUSES.review, STATUSES.money].includes(ticket.status));
  }
  if (user.role === "accountant") {
    return visible.filter((ticket) => ticket.status === STATUSES.money);
  }
  return visible.filter((ticket) => !isFinalStatus(ticket.status));
}

function dashboardCards(user) {
  const tickets = dashboardActionableTickets(user);
  const today = todayKey();
  const stale = tickets.filter(isOverdueTicket).length;
  if (user.role === "warehouse") {
    return [
      ["Чернетки", tickets.filter((t) => t.status === STATUSES.draft && t.warehouseUserId === user.id).length, STATUSES.draft],
      ["На доопрацюванні", tickets.filter((t) => t.status === STATUSES.rework && t.reworkTarget === "warehouse").length, STATUSES.rework],
      ["Потрібно обробити", tickets.length, ""],
      ["Прострочені", stale, "overdue"],
    ];
  }
  if (user.role === "manager") {
    return [
      ["До перевірки потрібно оформити", tickets.filter((t) => t.status === STATUSES.new).length, STATUSES.new],
      ["На доопрацюванні", tickets.filter((t) => t.status === STATUSES.rework && t.reworkTarget !== "warehouse").length, STATUSES.rework],
      ["Потрібно обробити", tickets.length, ""],
      ["Прострочені", stale, "overdue"],
    ];
  }
  if (user.role === "head") {
    return [
      ["На перевірку", tickets.filter((t) => t.status === STATUSES.review).length, STATUSES.review],
      ["Очікують повернення", tickets.filter((t) => t.status === STATUSES.money).length, STATUSES.money],
      ["Потрібно обробити", tickets.length, ""],
      ["Прострочені", stale, "overdue"],
    ];
  }
  if (user.role === "accountant") {
    return [
      ["Повернення коштів", tickets.filter((t) => t.status === STATUSES.money).length, STATUSES.money],
      ["Потрібно обробити", tickets.length, ""],
      ["Сума до виплати", money(tickets.reduce((sum, t) => sum + finalAmount(t), 0)), ""],
      ["Прострочені", stale, "overdue"],
    ];
  }
  return [
    ["Користувачі", state.users.length, ""],
    ["Активні заявки", tickets.filter((t) => !isFinalStatus(t.status)).length, ""],
    ["Прострочені", stale, "overdue"],
    ["Повернення", tickets.filter((t) => t.type === "Повернення").length, ""],
    ["Обміни", tickets.filter((t) => t.type === "Обмін").length, ""],
    ["Відмови", tickets.filter((t) => t.type === "Відмова на пошті").length, ""],
  ];
}

function renderDashboard(user) {
  const cards = dashboardCards(user);
  const recent = dashboardActionableTickets(user).slice(0, 6);
  return `
    ${renderRoleHero(user)}
    <section class="section">
      <div class="stats-grid">
        ${cards.map(([label, value, status]) => `<button class="stat-card" onclick="filterByStatus('${status}')"><span>${label}</span><strong>${value}</strong></button>`).join("")}
      </div>
    </section>
    <section class="section">
      <div class="actions">
        ${canCreateTicket(user) ? `<button onclick="setPage('create')">Створити повернення</button>` : ""}
        <button class="ghost" onclick="view.mine=true; setPage('tickets')">Мої заявки</button>
      </div>
    </section>
    <section class="section">
      <h3>Потрібно обробити</h3>
      <div class="grid">${recent.length ? recent.map(renderTicketCard).join("") : `<div class="empty">Поки заявок немає</div>`}</div>
    </section>
  `;
}

function renderRoleHero(user) {
  const tickets = dashboardActionableTickets(user);
  const overdue = tickets.filter(isOverdueTicket).length;
  const rework = tickets.filter((ticket) => ticket.status === STATUSES.rework).length;
  const text = {
    warehouse: "Сьогодні головне - швидко прийняти повернення і передати офісу.",
    manager: "Фокус дня - оформити звернення без помилок і передати на перевірку.",
    head: "Ваш екран контролю: перевірка, доопрацювання і фінальна якість процесу.",
    accountant: "Тут зібрані заявки, де вже можна проводити виплату.",
    admin: "Повний огляд системи, користувачів і операцій.",
  }[user.role] || "Ваші актуальні задачі";
  return `
    <section class="role-hero ${ROLE_ACCENTS[user.role] || ""}">
      <div>
        <div class="role-pill">${ROLES[user.role]}</div>
        <h2>Вітаю, ${escapeHtml(user.name)}</h2>
        <p>${text}</p>
      </div>
      <div class="role-hero-metrics">
        <div><span>Потрібно</span><b>${tickets.length}</b></div>
        <div><span>Прострочено</span><b>${overdue}</b></div>
        <div><span>Доопрацювання</span><b>${rework}</b></div>
      </div>
    </section>
  `;
}

function filterByStatus(status) {
  view.filter = {};
  if (status === "overdue") view.filter.overdue = true;
  if (status && Object.values(STATUSES).includes(status)) view.filter.status = status;
  view.page = "tickets";
  render();
}

function renderTickets(user) {
  const tickets = visibleTickets();
  return `
    <section class="section">
      <div class="toolbar stats-toolbar">
        <input id="ticketSearch" placeholder="Пошук" value="${view.filter.search || ""}" oninput="setFilter('search', this.value)" />
        ${brandSelectControl("ticketFilterBrand", "Бренд", view.filter.brand, `onchange="setFilter('brand', this.value); updateBrandSelectTheme()"`, true)}
        <select onchange="setFilter('status', this.value)">${option("", "Статус")}${Object.values(STATUSES).map((s) => option(s, s, view.filter.status)).join("")}</select>
        <select onchange="setFilter('type', this.value)">${option("", "Тип")}${TYPES.map((t) => option(t, t, view.filter.type)).join("")}</select>
        <button class="ghost" onclick="toggleMine()">${view.mine ? "Усі доступні" : "Мої заявки"}</button>
        <select onchange="setFilter('fop', this.value)">${option("", "ФОП")}${state.fops.map((fop) => option(fop, fop, view.filter.fop)).join("")}</select>
        <select onchange="setFilter('paymentMethod', this.value)">${option("", "Спосіб оплати")}${PAYMENT_METHODS.map((method) => option(method, method, view.filter.paymentMethod)).join("")}</select>
        ${canCreateTicket(user) ? `<button onclick="setPage('create')">Створити повернення</button>` : ""}
      </div>
    </section>
    <section class="section">
      <div id="ticketsGrid" class="grid">${renderTicketList(tickets)}</div>
    </section>
  `;
}

function renderTicketList(tickets = visibleTickets()) {
  return tickets.length ? tickets.map(renderTicketCard).join("") : `<div class="empty">Нічого не знайдено</div>`;
}

function refreshTicketList() {
  const grid = byId("ticketsGrid");
  if (!grid) {
    render();
    return;
  }
  grid.innerHTML = renderTicketList();
  hydrateInlineActions(grid);
}

function setFilter(key, value) {
  view.filter[key] = value;
  if (view.page === "tickets") refreshTicketList();
  else render();
}

function toggleMine() {
  view.mine = !view.mine;
  render();
}

function option(value, label, selected = "") {
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function renderTicketCard(ticket) {
  return `
    <article class="ticket-card" onclick="setPage('ticket','${ticket.id}')">
      <div class="ticket-top">
        <div>
          <div class="ticket-title">${ticket.crmId || "Чернетка"} · ${orderNumberLabel(ticket)}</div>
          <div class="meta">${ticket.brand} · ${ticket.type} · ${formatDateTime(ticket.createdAt)}</div>
        </div>
        <div class="ticket-status-stack">${badge(ticket.status)}${isOverdueTicket(ticket) ? `<span class="sla-badge">Прострочено ${overdueText(ticket)}</span>` : ""}</div>
      </div>
      <div class="kv">
        <div><span>ПІБ</span><b>${ticket.clientName || "—"}</b></div>
        <div><span>Товар</span><b>${ticket.returnedProduct || "—"}</b></div>
        <div><span>Фінальна сума</span><b>${hasWarehouseMoney(ticket) || isPreShipmentRefusal(ticket) ? money(finalAmount(ticket)) : "—"}</b></div>
        <div><span>Відповідальний</span><b>${responsibleName(ticket)}</b></div>
        <div><span>Очікується дія від</span>${expectedActionBadge(ticket)}</div>
      </div>
    </article>
  `;
}

function slaHoursFor(ticket) {
  if ([STATUSES.new, STATUSES.review, STATUSES.money, STATUSES.rework].includes(ticket.status)) return 24;
  if (ticket.status === STATUSES.draft) return 72;
  return 0;
}

function ageHours(ticket) {
  const source = ticket.updatedAt || ticket.createdAt;
  if (!source) return 0;
  return Math.max(0, (Date.now() - new Date(source).getTime()) / 36e5);
}

function isOverdueTicket(ticket) {
  const limit = slaHoursFor(ticket);
  return Boolean(limit && !isFinalStatus(ticket.status) && ageHours(ticket) > limit);
}

function overdueText(ticket) {
  const limit = slaHoursFor(ticket);
  const hours = Math.floor(Math.max(0, ageHours(ticket) - limit));
  if (hours < 24) return `${hours || 1} год`;
  const days = Math.floor(hours / 24);
  return `${days} дн`;
}

function orderNumberLabel(ticket) {
  return `<span class="order-highlight">№${escapeHtml(ticket.orderNumber || "—")}</span>`;
}

function expectedActionFrom(ticket) {
  if (ticket.status === STATUSES.draft) return "складу";
  if (ticket.status === STATUSES.new) return "офісу";
  if (ticket.status === STATUSES.rework) return ticket.reworkTarget === "warehouse" ? "складу" : "офісу";
  if (ticket.status === STATUSES.review) return "керівника";
  if (ticket.status === STATUSES.money) return "бухгалтера";
  return "";
}

function expectedActionBadge(ticket) {
  const value = expectedActionFrom(ticket);
  if (!value) return `<b>—</b>`;
  const key = {
    складу: "warehouse",
    офісу: "office",
    керівника: "head",
    бухгалтера: "accountant",
  }[value] || "default";
  return `<span class="expected-badge expected-${key}">${escapeHtml(value)}</span>`;
}

function responsibleName(ticket) {
  if (ticket.status === STATUSES.money || ticket.status === STATUSES.paid) return userName(ticket.accountantUserId) || "Бухгалтер";
  if ([STATUSES.review, STATUSES.rework, STATUSES.rejected].includes(ticket.status)) return userName(ticket.reviewerUserId) || "Керівник";
  if (ticket.managerUserId) return userName(ticket.managerUserId);
  return userName(ticket.warehouseUserId);
}

function canCreateTicket(user) {
  return ["warehouse", "head", "admin"].includes(user.role);
}

function renderTicketForm(user) {
  return `
    <form onsubmit="saveNewTicket(event)" class="grid">
      <section class="panel">
        <h3>Основна інформація</h3>
        <div class="form-grid">
          ${brandSelectControl("brand", "Бренд", "", `onchange="updateCreateVisibility(); updateBrandSelectTheme()"`)}
          ${selectField("type", "Тип заявки", TYPES, "", `onchange="updateCreateVisibility()"`)}
          ${inputField("orderNumber", "Номер замовлення", "number")}
        </div>
      </section>
      <section class="panel">
        <h3>Інформація складу</h3>
        <div class="form-grid">
          ${selectField("warehouseFop", "ФОП", state.fops, "")}
          ${inputField("returnedProduct", "Товар", "text")}
          <div id="createMoneyFields" class="form-grid full">
            ${inputField("returnAmount", "Сума повернення", "number", "", false, `oninput="updateCreateVisibility()"`)}
            ${selectField("deliveryPaid", "Доставка оплачена", ["Так", "Ні"], "", `onchange="updateCreateVisibility()"`)}
            <div id="createDeliveryDeductionWrap">${inputField("deliveryDeduction", "Сума доставки", "number", "", false, `oninput="updateCreateVisibility()"`)}</div>
            <div id="createFinalAmountWrap">${inputField("calculated", "Фінальна сума", "text", "", true)}</div>
          </div>
        </div>
      </section>
      <section id="createTelegramSection" class="panel">
        <h3>Telegram</h3>
        <label class="checkbox"><input id="photoSent" type="checkbox" /><span>Фото відправлено в Telegram</span></label>
      </section>
      <section class="panel">
        <h3>Коментар</h3>
        <textarea id="warehouseComment"></textarea>
      </section>
      <div id="formErrors" class="error"></div>
      <div class="bottom-actions">
        <button type="button" class="ghost" onclick="setPage('tickets')">Назад</button>
        <button type="button" class="ghost" onclick="saveNewTicket(event, true)">Зберегти як чернетку</button>
        <button>Передати менеджеру</button>
      </div>
    </form>
  `;
}

function inputField(id, label, type = "text", value = "", readonly = false, attrs = "") {
  return `<div class="field"><label>${label}</label><input id="${id}" type="${type}" value="${escapeHtml(value)}" ${readonly ? "readonly" : ""} ${attrs} /></div>`;
}

function selectField(id, label, items, selected = "", attrs = "") {
  return `<div class="field"><label>${label}</label><select id="${id}" ${attrs}>${option("", "Оберіть", selected)}${items.map((item) => option(item, item, selected)).join("")}</select></div>`;
}

function brandSelectControl(id, label, selected = "", attrs = "", hideLabel = false) {
  return `<div class="field"><label>${hideLabel ? "&nbsp;" : label}</label><select id="${id}" class="brand-select" ${attrs}>${option("", hideLabel ? "Бренд" : "Оберіть", selected)}${BRANDS.map((item) => brandOption(item, selected)).join("")}</select></div>`;
}

function brandOption(value, selected = "") {
  const style = value === "MOOW"
    ? `style="background:#f27a1a;color:#fff;"`
    : `style="background:#111;color:#fff;"`;
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""} ${style}>${escapeHtml(value)}</option>`;
}

function ticketFromCreateForm(status) {
  const brand = byId("brand").value;
  const ticket = {
    id: crypto.randomUUID(),
    crmId: status === STATUSES.draft ? "" : nextCrmId(brand),
    status,
    brand,
    type: byId("type").value,
    orderNumber: byId("orderNumber").value.trim(),
    warehouseFop: byId("warehouseFop").value,
    returnedProduct: byId("returnedProduct").value.trim(),
    returnAmount: ["Відмова на пошті", "Відмова до відправки", "Обмін"].includes(byId("type").value) ? 0 : Number(byId("returnAmount").value || 0),
    deliveryPaid: byId("deliveryPaid").value,
    deliveryDeduction: byId("deliveryPaid").value === "Ні" ? Number(byId("deliveryDeduction").value || 0) : 0,
    photoSent: byId("photoSent").checked,
    warehouseComment: byId("warehouseComment").value.trim(),
    managerComment: "",
    otherReasonComment: "",
    stockOfferConfirmed: false,
    checklist: {},
    comments: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    warehouseUserId: currentUser().id,
    managerUserId: "",
    reviewerUserId: "",
    accountantUserId: "",
  };
  return ticket;
}

function validateWarehouse(ticket, draft = false) {
  if (draft) return [];
  const errors = [];
  ["brand", "type", "orderNumber", "warehouseFop", "returnedProduct"].forEach((key) => {
    if (!ticket[key]) errors.push(requiredLabel(key));
  });
  if (hasWarehouseMoney(ticket) && (!ticket.returnAmount || ticket.returnAmount <= 0)) errors.push("Сума повернення");
  if (shouldShowDeliveryMoney(ticket) && (!ticket.deliveryDeduction || ticket.deliveryDeduction <= 0)) errors.push("Сума доставки");
  if (ticket.type !== "Відмова до відправки" && !ticket.photoSent) errors.push("Фото відправлено в Telegram");
  return errors;
}

function findDuplicateOrder(ticket) {
  const orderNumber = String(ticket.orderNumber || "").trim();
  if (!orderNumber) return null;
  return state.tickets.find((item) => {
    if (item.id === ticket.id) return false;
    if (item.status === STATUSES.deleted) return false;
    return String(item.orderNumber || "").trim() === orderNumber;
  }) || null;
}

function duplicateOrderMessage(duplicate) {
  if (!duplicate) return "";
  return `Схожа заявка вже існує: ${duplicate.crmId || "чернетка"} · №${duplicate.orderNumber} · ${duplicate.brand} · ${duplicate.status}`;
}

function requiredLabel(key) {
  return {
    brand: "Бренд",
    type: "Тип заявки",
    orderNumber: "Номер замовлення",
    warehouseFop: "ФОП",
    returnedProduct: "Товар",
  }[key] || key;
}

async function saveNewTicket(event, draft = false) {
  event.preventDefault();
  const status = draft ? STATUSES.draft : STATUSES.new;
  const ticket = ticketFromCreateForm(status);
  if (isRemoteSession()) ticket.crmId = "";
  const errors = validateWarehouse(ticket, draft);
  if (errors.length) {
    const target = byId("formErrors");
    target.textContent = `Заповніть або виправте: ${errors.join(", ")}`;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const duplicate = findDuplicateOrder(ticket);
  if (duplicate) {
    const target = byId("formErrors");
    target.textContent = duplicateOrderMessage(duplicate);
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (isRemoteSession()) {
    try {
      const payload = await remoteTicketAction(draft ? "saveDraft" : "submitWarehouseDraft", ticket);
      await loadRemoteData();
      setPage("ticket", payload.ticket.id);
    } catch (error) {
      byId("formErrors").textContent = error.message;
    }
    return;
  }
  state.tickets.unshift(ticket);
  logAction(ticket, draft ? "збережено чернетку" : "створено звернення", "", ticket.status);
  saveState();
  setPage("ticket", ticket.id);
}

function updateCreateVisibility() {
  const type = byId("type")?.value;
  const deliveryPaid = byId("deliveryPaid")?.value;
  const moneyWrap = byId("createMoneyFields");
  const deliveryWrap = byId("createDeliveryDeductionWrap");
  const finalWrap = byId("createFinalAmountWrap");
  const telegramSection = byId("createTelegramSection");
  const returnAmount = Number(byId("returnAmount")?.value || 0);
  const deliveryDeduction = Number(byId("deliveryDeduction")?.value || 0);
  const hideWarehouseMoney = ["Відмова на пошті", "Відмова до відправки", "Обмін"].includes(type);
  if (telegramSection) telegramSection.style.display = type === "Відмова до відправки" ? "none" : "";
  if (moneyWrap) moneyWrap.style.display = hideWarehouseMoney ? "none" : "";
  const showDelivery = !hideWarehouseMoney && deliveryPaid === "Ні";
  if (deliveryWrap) deliveryWrap.style.display = showDelivery ? "" : "none";
  if (finalWrap) finalWrap.style.display = showDelivery ? "" : "none";
  if (byId("calculated")) byId("calculated").value = showDelivery ? money(Math.max(0, returnAmount - deliveryDeduction)) : "";
  if (!showDelivery && byId("deliveryDeduction")) byId("deliveryDeduction").value = "";
}

function renderTicketDetails(user) {
  const ticket = state.tickets.find((item) => item.id === view.selectedId);
  if (!ticket || !canSeeTicket(user, ticket)) return `<div class="empty">Заявку не знайдено або немає доступу</div>`;
  const readonly = isFinalStatus(ticket.status) && !["admin", "manager", "accountant"].includes(user.role);
  return `
    ${ticket.status === STATUSES.rework && ticket.comments.length ? renderReworkBanner(ticket) : ""}
    <section class="section">
      <div class="ticket-top">
        <div>
          <h2>${ticket.crmId || "Чернетка"} · ${orderNumberLabel(ticket)}</h2>
          <div class="meta">${ticket.brand} · ${ticket.type} · створено ${formatDateTime(ticket.createdAt)}</div>
        </div>
        ${badge(ticket.status)}
      </div>
    </section>
    ${renderWorkflowSteps(ticket)}
    <div class="tabs">
      ${["Картка", "Історія", "Коментарі"].map((tab) => `<button class="${view.tab === tab ? "active" : ""}" onclick="view.tab='${tab}'; render()">${tab}</button>`).join("")}
    </div>
    ${view.tab === "Історія" ? renderHistory(ticket) : view.tab === "Коментарі" ? renderComments(ticket) : renderCardBlocks(user, ticket, readonly)}
  `;
}

function renderWorkflowSteps(ticket) {
  const steps = ["Склад", "Офіс", "Керівник", "Бухгалтер", "Готово"];
  const current = workflowStep(ticket);
  return `
    <section class="workflow section">
      ${steps.map((step, index) => {
        const stateClass = index < current ? "done" : index === current ? "active" : "";
        return `<div class="workflow-step ${stateClass}"><span>${index + 1}</span><b>${step}</b></div>`;
      }).join("")}
    </section>
  `;
}

function workflowStep(ticket) {
  if ([STATUSES.paid, STATUSES.doneNoRefund, STATUSES.rejected].includes(ticket.status)) return 4;
  if (ticket.status === STATUSES.money) return 3;
  if (ticket.status === STATUSES.review) return 2;
  if (ticket.status === STATUSES.new || (ticket.status === STATUSES.rework && ticket.reworkTarget !== "warehouse")) return 1;
  return 0;
}

function renderReworkBanner(ticket) {
  const comment = ticket.comments.find((item) => item.type === "rework");
  return `<div class="redbox"><strong>Заявка повернута на доопрацювання</strong><div>${escapeHtml(comment?.text || "")}</div><div class="meta">${formatDateTime(comment?.at)} · ${escapeHtml(comment?.author || "")}</div></div>`;
}

function renderCardBlocks(user, ticket, readonly) {
  return `
    <section class="panel section">
      <h3>Загальна інформація</h3>
      <div class="kv">
        <div><span>CRM ID</span><b>${ticket.crmId || "—"}</b></div>
        <div><span>Номер замовлення</span><b>${orderNumberLabel(ticket)}</b></div>
        <div><span>Статус</span><b>${ticket.status}</b></div>
        <div><span>Очікується дія від</span><b>${expectedActionFrom(ticket) || "—"}</b></div>
        <div><span>Відповідальний</span><b>${responsibleName(ticket)}</b></div>
      </div>
    </section>
    ${renderWarehouseBlock(user, ticket, readonly)}
    ${renderManagerBlock(user, ticket, readonly)}
    ${renderHeadBlock(user, ticket, readonly)}
    ${renderAccountingBlock(user, ticket, readonly)}
    ${renderActions(user, ticket, readonly)}
  `;
}

function renderWarehouseBlock(user, ticket, readonly) {
  if (canEditWarehouseDraft(user, ticket)) return renderWarehouseDraftEditor(ticket);
  const hideWarehouseFop = user.role === "manager" || user.role === "accountant";
  const showMoney = hasWarehouseMoney(ticket);
  const showDeliveryMoney = shouldShowDeliveryMoney(ticket);
  const showPhoto = ticket.type !== "Відмова до відправки";
  return `
    <section class="panel section">
      <h3>Інформація складу</h3>
      <div class="kv">
        <div><span>Бренд</span><b>${ticket.brand}</b></div>
        <div><span>Тип заявки</span><b>${ticket.type}</b></div>
        <div><span>Номер замовлення</span><b>${orderNumberLabel(ticket)}</b></div>
        ${hideWarehouseFop ? "" : `<div><span>ФОП складу</span><b>${ticket.warehouseFop}</b></div>`}
        <div><span>Товар</span><b>${ticket.returnedProduct}</b></div>
        ${showMoney ? `<div><span>Початкова сума</span><b>${money(ticket.returnAmount)}</b></div>` : ""}
        ${showMoney ? `<div><span>Доставка оплачена</span><b>${ticket.deliveryPaid}</b></div>` : ""}
        ${showDeliveryMoney ? `<div><span>Сума утримання</span><b>${money(ticket.deliveryDeduction)}</b></div>` : ""}
        ${showDeliveryMoney ? `<div><span>Фінальна сума</span><b>${money(finalAmount(ticket))}</b></div>` : ""}
        ${showPhoto ? `<div><span>Фото</span><b>${ticket.photoSent ? "Відправлено" : "Не підтверджено"}</b></div>` : ""}
        <div><span>Коментар</span><b>${ticket.warehouseComment || "—"}</b></div>
      </div>
    </section>
  `;
}

function canEditWarehouseDraft(user, ticket) {
  if (!canCreateTicket(user) || isFinalStatus(ticket.status)) return false;
  return ticket.status === STATUSES.draft || (ticket.status === STATUSES.rework && ticket.reworkTarget === "warehouse");
}

function canDeleteDraft(user, ticket) {
  if (!user || ticket.status !== STATUSES.draft) return false;
  if (["admin", "head"].includes(user.role)) return true;
  return [ticket.warehouseUserId, ticket.managerUserId, ticket.reviewerUserId, ticket.accountantUserId, ticket.updatedBy].includes(user.id);
}

function renderWarehouseDraftEditor(ticket) {
  return `
    <section class="panel section">
      <h3>Інформація складу</h3>
      <div class="form-grid">
        ${brandSelectControl("draftBrand", "Бренд", ticket.brand, `onchange="updateDraftVisibility(); updateBrandSelectTheme()"`)}
        ${selectField("draftType", "Тип заявки", TYPES, ticket.type, `onchange="updateDraftVisibility()"`)}
        ${editableInput("draftOrderNumber", "Номер замовлення", "number", ticket.orderNumber, true)}
        ${editableSelect("draftWarehouseFop", "ФОП", state.fops, ticket.warehouseFop, true)}
        ${editableInput("draftReturnedProduct", "Товар", "text", ticket.returnedProduct, true)}
        <div id="draftMoneyFields" class="form-grid full">
          ${editableInput("draftReturnAmount", "Сума повернення", "number", ticket.returnAmount, true, `oninput="updateDraftVisibility()"`)}
          ${selectField("draftDeliveryPaid", "Доставка оплачена", ["Так", "Ні"], ticket.deliveryPaid || "", `onchange="updateDraftVisibility()"`)}
          <div id="draftDeliveryDeductionWrap">${editableInput("draftDeliveryDeduction", "Сума доставки", "number", ticket.deliveryDeduction, true, `oninput="updateDraftVisibility()"`)}</div>
          <div id="draftFinalAmountWrap">${inputField("draftCalculated", "Фінальна сума", "text", money(finalAmount(ticket)), true)}</div>
        </div>
        <div id="draftTelegramSection" class="full"><label class="checkbox"><input id="draftPhotoSent" type="checkbox" ${ticket.photoSent ? "checked" : ""} /><span>Фото відправлено в Telegram</span></label></div>
        <div class="field full"><label>Коментар</label><textarea id="draftWarehouseComment">${escapeHtml(ticket.warehouseComment || "")}</textarea></div>
      </div>
    </section>
  `;
}

function managerNeedsFullPayment(ticket) {
  return ticket.type === "Повернення" || isPreShipmentRefusal(ticket) || (ticket.type === "Обмін" && ticket.exchangeResult === "Наше повернення різниці");
}

function renderManagerBlock(user, ticket, readonly) {
  if (user.role === "warehouse") return "";
  const canEdit = canEditManagerFields(user, ticket, readonly);
  const showExchange = ticket.type === "Обмін";
  const fullPayment = managerNeedsFullPayment(ticket) || !canEdit;
  const reasons = reasonListFor(ticket);
  return `
    <section class="panel section">
      <h3>Інформація менеджера</h3>
      ${canSwitchToExchange(ticket) ? `<div class="manager-type-box"><div class="field" style="margin:0;">${editableSelect("managerType", "Тип заявки", managerTypeOptions(ticket), ticket.type, canEdit, `onchange="switchManagerType('${ticket.id}', this.value)"`)}</div><div class="hint">Якщо потрібен обмін - ставимо обмін</div></div>` : ""}
      <div class="form-grid">
        ${editableSelect("managerFop", "Обрати ФОП", state.fops, ticket.managerFop, canEdit)}
        ${ticket.type !== "Відмова на пошті" ? editableInput("orderDate", "Дата оформлення", "text", ticket.orderDate, canEdit, `inputmode="numeric" maxlength="10" placeholder="ДД.ММ.РРРР" oninput="autoDate(this)"`) + editableInput("orderTime", "Час оформлення", "text", ticket.orderTime, canEdit, `inputmode="numeric" maxlength="5" placeholder="ГГ:ХХ" oninput="autoTime(this)"`) : ""}
        ${editableInput("clientName", "ПІБ клієнта", "text", ticket.clientName, canEdit)}
        ${editableSelect("reason", "Причина", reasons, ticket.reason, canEdit, `onchange="saveTicketEdits('${ticket.id}', true); render()"`)}
        ${ticket.reason === "Інше" ? editableInput("otherReasonComment", "Коментар до причини", "text", ticket.otherReasonComment, canEdit) : ""}
        ${isPreShipmentRefusal(ticket) ? `<label class="checkbox full"><input id="stockOfferConfirmed" type="checkbox" ${ticket.stockOfferConfirmed ? "checked" : ""} ${canEdit ? "" : "disabled"} /><span>Якщо товар уже є на складі на момент повернення, клієнту запропонували його відправку</span></label>` : ""}
        ${isPreShipmentRefusal(ticket) ? editableInput("returnAmount", "Сума повернення", "number", ticket.returnAmount, canEdit) : ""}
        ${ticket.type !== "Відмова на пошті" ? editableSelect("paymentMethod", "Спосіб оплати", PAYMENT_METHODS, ticket.paymentMethod, canEdit, `onchange="saveTicketEdits('${ticket.id}', true); render()"`) : ""}
        ${showExchange ? renderExchangeFields(ticket, canEdit) : ""}
        ${fullPayment && ticket.type !== "Відмова на пошті" ? renderPaymentFields(ticket, canEdit) : ""}
        ${editableInput("managerComment", "Коментар менеджера", "text", ticket.managerComment, canEdit)}
      </div>
    </section>
  `;
}

function canEditManagerFields(user, ticket, readonly) {
  if (!["manager", "admin"].includes(user.role)) return false;
  if (user.role === "admin") return true;
  return ticket.status !== STATUSES.draft;
}

function canSubmitManagerStage(user, ticket, readonly) {
  if (!["manager", "admin"].includes(user.role)) return false;
  return ticket.status !== STATUSES.draft;
}

function renderExchangeFields(ticket, canEdit) {
  return `
    ${editableInput("newProduct", "Новий товар", "text", ticket.newProduct, canEdit)}
    ${editableInput("newProductPrice", "Вартість нового товару", "number", ticket.newProductPrice, canEdit)}
    ${editableSelect("exchangeResult", "Тип фінансового результату", ["Без доплат", "Доплата клієнта", "Наше повернення різниці"], ticket.exchangeResult, canEdit, `onchange="saveTicketEdits('${ticket.id}', true); render()"`)}
    ${ticket.exchangeResult === "Доплата клієнта" ? editableInput("clientExtraPayment", "Сума доплати", "number", ticket.clientExtraPayment, canEdit) : ""}
    ${ticket.exchangeResult === "Наше повернення різниці" ? editableInput("exchangeRefundAmount", "Сума повернення", "number", ticket.exchangeRefundAmount, canEdit) : ""}
  `;
}

function renderPaymentFields(ticket, canEdit) {
  const purpose = paymentPurpose(readFormOverlay(ticket));
  const showRequisites = needsPaymentDetails(readFormOverlay(ticket));
  return `
    ${showRequisites ? editableInput("iban", "IBAN", "text", ticket.iban, canEdit) : ""}
    ${showRequisites ? editableInput("taxId", "ІПН", "text", ticket.taxId, canEdit) : ""}
    ${showRequisites ? editableInput("receiverName", "ПІБ отримувача", "text", ticket.receiverName, canEdit) : ""}
    <div class="field"><label>Призначення платежу</label><input readonly value="${escapeHtml(purpose || ticket.paymentPurpose || "")}" /></div>
    ${needsMainCrmReturnStatus(ticket) ? `<label class="checkbox full"><input id="mainCrmReturnStatus" type="checkbox" ${ticket.mainCrmReturnStatus ? "checked" : ""} ${canEdit ? "" : "disabled"} /><span>Статус «Повернення товару» встановлено</span></label>` : ""}
    ${needsMainCrmRefusalStatus(ticket) ? `<label class="checkbox full"><input id="mainCrmReturnStatus" type="checkbox" ${ticket.mainCrmReturnStatus ? "checked" : ""} ${canEdit ? "" : "disabled"} /><span>В CRM проставлено статус «Відмова»</span></label>` : ""}
  `;
}

function renderHeadBlock(user, ticket, readonly) {
  if (!["head", "admin"].includes(user.role) || ticket.type === "Відмова на пошті") return "";
  const canEdit = !readonly && (user.role === "head" || user.role === "admin") && ticket.status === STATUSES.review;
  const checks = headChecks(ticket);
  return `
    <section class="panel section">
      <h3>Перевірка керівника</h3>
      ${checks.map((label, index) => `<label class="checkbox"><input id="check${index}" type="checkbox" ${ticket.checklist?.[index] ? "checked" : ""} ${canEdit ? "" : "disabled"} /><span>${label}</span></label>`).join("")}
    </section>
  `;
}

function renderAccountingBlock(user, ticket, readonly) {
  if (!["accountant", "head", "admin"].includes(user.role)) return "";
  if (ticket.type === "Відмова на пошті" || (ticket.type === "Обмін" && ["Доплата клієнта", "Без доплат"].includes(ticket.exchangeResult))) return "";
  const showRequisites = needsPaymentDetails(ticket);
  const rows = [
    ["Номер заявки", ticket.orderNumber, false],
    ["Бренд", ticket.brand, false],
    ["Тип заявки", ticket.type, false],
    ["ФОП", ticket.managerFop, false],
    ["ПІБ клієнта", ticket.clientName, true],
    ["Спосіб оплати", ticket.paymentMethod, false],
    ["Початкова сума", money(ticket.returnAmount), false],
    ...(isPreShipmentRefusal(ticket) ? [] : [["Доставка оплачена", ticket.deliveryPaid, false]]),
    ...(shouldShowDeliveryMoney(ticket) ? [["Сума утримання", money(ticket.deliveryDeduction), false]] : []),
    ...(showRequisites ? [["IBAN", ticket.iban, true], ["ІПН", ticket.taxId, true], ["ПІБ отримувача", ticket.receiverName, true]] : []),
    ["Призначення платежу", ticket.paymentPurpose || paymentPurpose(ticket), true],
    ["До виплати", money(finalAmount(ticket)), true],
  ];
  return `
    <section class="panel section">
      <h3>Повернення коштів</h3>
      ${rows.map(([label, value, copy]) => `<div class="copy-row accounting-row ${label === "До виплати" ? "accounting-total" : ""}"><div><span class="meta">${label}</span><br><b>${escapeHtml(value || "—")}</b></div>${copy ? copyButton(value || "") : ""}</div>`).join("")}
    </section>
  `;
}

function copyButton(value) {
  return `<button class="ghost copy-button" onclick="copyText('${escapeAttr(value || "")}')"><span class="action-icon">${actionIcon("copy")}</span><span class="action-label">Копіювати</span></button>`;
}

function renderActions(user, ticket, readonly) {
  if (readonly) return "";
  const actions = [actionButton("", "setPage('tickets')", "ghost action-button", "back")];
  if (canEditWarehouseDraft(user, ticket)) {
    actions.push(actionButton("", `saveWarehouseDraft('${ticket.id}')`, "ghost action-button", "save"));
    actions.push(actionButton("Передати", `submitWarehouseDraft('${ticket.id}')`, "action-button"));
  }
  if (canDeleteDraft(user, ticket)) {
    actions.push(actionButton("Видалити", `deleteDraft('${ticket.id}')`, "danger action-button"));
  }
  if (canEditManagerFields(user, ticket, readonly)) {
    actions.push(actionButton("", `saveTicketEdits('${ticket.id}')`, "ghost action-button", "save"));
  }
  if (canSubmitManagerStage(user, ticket, readonly)) {
    actions.push(actionButton(managerFinishLabel(ticket), `managerSubmit('${ticket.id}')`, "action-button"));
  }
  if (user.role === "manager" && !isFinalStatus(ticket.status) && ticket.status !== STATUSES.draft) {
    actions.push(actionButton("На склад", `managerReworkWarehouse('${ticket.id}')`, "ghost action-button"));
  }
  if ((user.role === "head" || user.role === "admin") && ticket.status === STATUSES.review) {
    actions.push(actionButton("На повернення", `headApprove('${ticket.id}')`, "success action-button"));
    actions.push(actionButton("Доопрацювати", `headRework('${ticket.id}')`, "ghost action-button"));
    actions.push(actionButton("Відхилити", `headReject('${ticket.id}')`, "danger action-button"));
  }
  if ((user.role === "head" || user.role === "admin") && ticket.status === STATUSES.money) {
    actions.push(actionButton("Доопрацювати", `headRework('${ticket.id}')`, "ghost action-button"));
    actions.push(actionButton("Відхилити", `headReject('${ticket.id}')`, "danger action-button"));
  }
  if ((user.role === "accountant" || user.role === "admin") && ticket.status === STATUSES.money) {
    actions.push(actionButton("Повернення", `markPaid('${ticket.id}')`, "success action-button"));
  }
  if ((user.role === "accountant" || (user.role === "admin" && ![STATUSES.review, STATUSES.money].includes(ticket.status))) && ![STATUSES.deleted, STATUSES.rework].includes(ticket.status)) {
    actions.push(actionButton("Доопрацювати", `headRework('${ticket.id}')`, "ghost action-button"));
  }
  if (user.role === "admin" && ticket.status !== STATUSES.deleted) {
    actions.push(actionButton("Видалити", `deleteTicket('${ticket.id}')`, "danger action-button"));
  }
  return `<div id="actionErrors" class="error section"></div><div class="bottom-actions">${actions.join("")}</div>`;
}

function managerFinishLabel(ticket) {
  if (ticket.type === "Відмова на пошті") return "Завершити без повернення";
  if (ticket.type === "Обмін" && ["Доплата клієнта", "Без доплат"].includes(ticket.exchangeResult)) return "Завершити без повернення";
  return "На перевірку";
}

function actionIcon(name) {
  if (name === "back") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  if (name === "save") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11l3 3v13H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 4v6h8V4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 18h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  }
  if (name === "copy") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V7a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  }
  return "";
}

function actionButton(label, onclick, className = "", icon = "") {
  const iconHtml = icon ? `<span class="action-icon">${actionIcon(icon)}</span>` : "";
  const textHtml = label ? `<span class="action-label">${escapeHtml(label)}</span>` : "";
  const compactClass = label ? "" : " icon-only";
  return `<button class="${className}${compactClass}" onclick="${onclick}">${iconHtml}${textHtml}</button>`;
}

function editableInput(id, label, type, value, canEdit, attrs = "") {
  return `<div class="field"><label>${label}</label><input id="${id}" type="${type}" value="${escapeHtml(value || "")}" ${canEdit ? attrs : "readonly"} /></div>`;
}

function editableSelect(id, label, items, value, canEdit, attrs = "") {
  return `<div class="field"><label>${label}</label><select id="${id}" ${canEdit ? attrs : "disabled"}>${option("", "Оберіть", value)}${items.map((item) => option(item, item, value)).join("")}</select></div>`;
}

function canSwitchToExchange(ticket) {
  return TYPES.includes(ticket.type);
}

function managerTypeOptions(ticket) {
  return [...new Set([ticket.type, "Обмін"])];
}

function readFormOverlay(ticket) {
  const fields = ["managerType", "managerFop", "orderDate", "orderTime", "clientName", "reason", "otherReasonComment", "paymentMethod", "iban", "taxId", "receiverName", "managerComment", "newProduct", "newProductPrice", "exchangeResult", "clientExtraPayment", "exchangeRefundAmount", "returnAmount"];
  const copy = { ...ticket };
  fields.forEach((id) => {
    const node = byId(id);
    if (node) copy[id] = node.value;
  });
  if (copy.managerType) copy.type = copy.managerType;
  const checkbox = byId("mainCrmReturnStatus");
  if (checkbox) copy.mainCrmReturnStatus = checkbox.checked;
  const stockOffer = byId("stockOfferConfirmed");
  if (stockOffer) copy.stockOfferConfirmed = stockOffer.checked;
  if (!needsPaymentDetails(copy)) {
    copy.iban = "";
    copy.taxId = "";
    copy.receiverName = "";
  }
  copy.paymentPurpose = paymentPurpose(copy);
  return copy;
}

function readWarehouseDraftOverlay(ticket) {
  return {
    ...ticket,
    brand: byId("draftBrand")?.value || ticket.brand,
    type: byId("draftType")?.value || ticket.type,
    orderNumber: byId("draftOrderNumber")?.value.trim() || "",
    warehouseFop: byId("draftWarehouseFop")?.value || "",
    returnedProduct: byId("draftReturnedProduct")?.value.trim() || "",
    returnAmount: ["Відмова на пошті", "Відмова до відправки", "Обмін"].includes(byId("draftType")?.value) ? 0 : Number(byId("draftReturnAmount")?.value || 0),
    deliveryPaid: byId("draftDeliveryPaid")?.value || "Так",
    deliveryDeduction: byId("draftDeliveryPaid")?.value === "Ні" ? Number(byId("draftDeliveryDeduction")?.value || 0) : 0,
    photoSent: Boolean(byId("draftPhotoSent")?.checked),
    warehouseComment: byId("draftWarehouseComment")?.value.trim() || "",
    updatedAt: nowIso(),
    updatedBy: currentUser().id,
  };
}

async function saveWarehouseDraft(id) {
  const ticket = state.tickets.find((item) => item.id === id);
  const updated = readWarehouseDraftOverlay(ticket);
  const duplicate = findDuplicateOrder(updated);
  if (duplicate) return showActionErrors([duplicateOrderMessage(duplicate)]);
  const changes = describeChanges(ticket, updated);
  Object.assign(ticket, updated);
  if (isRemoteSession()) {
    try {
      await remoteTicketAction("saveDraft", ticket, { previousValue: changes.previous, newValue: changes.next });
      await loadRemoteData();
      render();
    } catch (error) {
      showActionErrors([error.message]);
    }
    return;
  }
  logAction(ticket, "збережено чернетку", changes.previous, changes.next);
  saveState();
  render();
}

async function submitWarehouseDraft(id) {
  const ticket = state.tickets.find((item) => item.id === id);
  Object.assign(ticket, readWarehouseDraftOverlay(ticket));
  const errors = validateWarehouse(ticket, false);
  if (errors.length) return showActionErrors(errors);
  const duplicate = findDuplicateOrder(ticket);
  if (duplicate) return showActionErrors([duplicateOrderMessage(duplicate)]);
  if (isRemoteSession()) {
    try {
      await remoteTicketAction("submitWarehouseDraft", ticket);
      await loadRemoteData();
      render();
    } catch (error) {
      showActionErrors([error.message]);
    }
    return;
  }
  const old = ticket.status;
  ticket.status = STATUSES.new;
  ticket.reworkTarget = "";
  if (!ticket.crmId) ticket.crmId = nextCrmId(ticket.brand);
  ticket.updatedAt = nowIso();
  logAction(ticket, "передано менеджеру", old, ticket.status);
  saveState();
  render();
}

async function deleteDraft(id) {
  const ticket = state.tickets.find((item) => item.id === id);
  if (!ticket || ticket.status !== STATUSES.draft) return;
  if (!confirm("Видалити чернетку?")) return;
  if (isRemoteSession()) {
    try {
      await remoteTicketAction("deleteDraft", ticket);
      await loadRemoteData();
      setPage("tickets");
    } catch (error) {
      showActionErrors([error.message]);
    }
    return;
  }
  state.tickets = state.tickets.filter((item) => item.id !== id);
  logAction(ticket, "видалено чернетку", ticket.status, "");
  saveState();
  setPage("tickets");
}

function updateDraftVisibility() {
  const type = byId("draftType")?.value;
  const deliveryPaid = byId("draftDeliveryPaid")?.value;
  const moneyWrap = byId("draftMoneyFields");
  const deliveryWrap = byId("draftDeliveryDeductionWrap");
  const finalWrap = byId("draftFinalAmountWrap");
  const telegramSection = byId("draftTelegramSection");
  const returnAmount = Number(byId("draftReturnAmount")?.value || 0);
  const deliveryDeduction = Number(byId("draftDeliveryDeduction")?.value || 0);
  const hideWarehouseMoney = ["Відмова на пошті", "Відмова до відправки", "Обмін"].includes(type);
  if (telegramSection) telegramSection.style.display = type === "Відмова до відправки" ? "none" : "";
  if (moneyWrap) moneyWrap.style.display = hideWarehouseMoney ? "none" : "";
  const showDelivery = !hideWarehouseMoney && deliveryPaid === "Ні";
  if (deliveryWrap) deliveryWrap.style.display = showDelivery ? "" : "none";
  if (finalWrap) finalWrap.style.display = showDelivery ? "" : "none";
  if (byId("draftCalculated")) byId("draftCalculated").value = showDelivery ? money(Math.max(0, returnAmount - deliveryDeduction)) : "";
  if (!showDelivery && byId("draftDeliveryDeduction")) byId("draftDeliveryDeduction").value = "";
}

async function saveTicketEdits(id, silent = false) {
  const ticket = state.tickets.find((item) => item.id === id);
  const updated = readFormOverlay(ticket);
  const changes = describeChanges(ticket, updated);
  Object.assign(ticket, updated, { updatedAt: nowIso(), updatedBy: currentUser().id });
  ticket.paymentPurpose = paymentPurpose(ticket);
  if (!ticket.managerUserId && currentUser().role === "manager") ticket.managerUserId = currentUser().id;
  if (isRemoteSession()) {
    try {
      await remoteTicketAction("saveTicket", ticket, { previousValue: changes.previous, newValue: changes.next });
      await loadRemoteData();
      if (!silent) showToast("Збережено");
      if (!silent) render();
    } catch (error) {
      if (!silent) showActionErrors([error.message]);
    }
    return;
  }
  logAction(ticket, "збережено зміни", changes.previous, changes.next);
  saveState();
  if (!silent) showToast("Збережено");
  if (!silent) render();
}

async function switchManagerType(id, value) {
  const ticket = state.tickets.find((item) => item.id === id);
  if (!ticket || !value || ticket.type === value) return;
  const previous = ticket.type;
  ticket.type = value;
  if (value === "Обмін") {
    ticket.paymentMethod = "";
    ticket.iban = "";
    ticket.taxId = "";
    ticket.receiverName = "";
    ticket.mainCrmReturnStatus = false;
  } else {
    ticket.newProduct = "";
    ticket.newProductPrice = "";
    ticket.exchangeResult = "";
    ticket.clientExtraPayment = "";
    ticket.exchangeRefundAmount = "";
  }
  ticket.updatedAt = nowIso();
  ticket.updatedBy = currentUser().id;
  if (isRemoteSession()) {
    try {
      await remoteTicketAction("saveTicket", ticket);
      await loadRemoteData();
      render();
    } catch (error) {
      showActionErrors([error.message]);
    }
    return;
  }
  logAction(ticket, "змінено тип заявки", previous, value);
  saveState();
  render();
}

function describeChanges(before, after) {
  const labels = {
    status: "Статус",
    brand: "Бренд",
    type: "Тип заявки",
    orderNumber: "Номер замовлення",
    warehouseFop: "ФОП складу",
    returnedProduct: "Товар",
    photoSent: "Фото відправлено",
    warehouseComment: "Коментар складу",
    managerFop: "ФОП",
    orderDate: "Дата",
    orderTime: "Час",
    clientName: "ПІБ",
    reason: "Причина",
    otherReasonComment: "Коментар причини",
    paymentMethod: "Спосіб оплати",
    iban: "IBAN",
    taxId: "ІПН",
    receiverName: "ПІБ отримувача",
    managerComment: "Коментар менеджера",
    newProduct: "Новий товар",
    newProductPrice: "Вартість нового товару",
    exchangeResult: "Тип обміну",
    clientExtraPayment: "Сума доплати",
    exchangeRefundAmount: "Сума повернення",
    returnAmount: "Сума повернення",
    stockOfferConfirmed: "Перевірка пропозиції відправки",
    mainCrmReturnStatus: "Статус у CRM",
  };
  const changed = Object.keys(labels).filter((key) => String(before[key] ?? "") !== String(after[key] ?? ""));
  if (!changed.length) return { previous: "без змін", next: "без змін" };
  return {
    previous: changed.map((key) => `${labels[key]}: ${before[key] ?? "—"}`).join("; "),
    next: changed.map((key) => `${labels[key]}: ${after[key] ?? "—"}`).join("; "),
  };
}

function validateManager(ticket) {
  const errors = [];
  const need = (key, label) => { if (!ticket[key]) errors.push(label); };
  need("managerFop", "ФОП");
  need("clientName", "ПІБ клієнта");
  need("reason", "Причина");
  if (ticket.reason === "Інше") need("otherReasonComment", "Коментар до причини");
  if (ticket.type === "Відмова на пошті") return errors;
  if (isPreShipmentRefusal(ticket)) {
    need("orderDate", "Дата оформлення");
    need("orderTime", "Час оформлення");
    need("paymentMethod", "Спосіб оплати");
    if (!Number(ticket.returnAmount || 0)) errors.push("Сума повернення");
    if (needsPaymentDetails(ticket)) {
      need("iban", "IBAN");
      need("taxId", "ІПН");
      need("receiverName", "ПІБ отримувача");
    }
    if (!ticket.stockOfferConfirmed) errors.push("Перевірка пропозиції відправки");
    if (ticket.iban && !/^UA[A-Z0-9]{27}$/.test(ticket.iban)) errors.push("IBAN у форматі UA + 27 символів");
    if (ticket.taxId && !/^\d{10}$/.test(ticket.taxId)) errors.push("ІПН рівно 10 цифр");
    return errors;
  }
  if (ticket.type === "Обмін") {
    need("newProduct", "Новий товар");
    need("newProductPrice", "Вартість нового товару");
    need("exchangeResult", "Тип фінансового результату");
    if (ticket.exchangeResult === "Доплата клієнта") {
      need("clientExtraPayment", "Сума доплати");
      return errors;
    }
    if (ticket.exchangeResult === "Без доплат") return errors;
    need("exchangeRefundAmount", "Сума повернення");
  }
  need("orderDate", "Дата оформлення");
  need("orderTime", "Час оформлення");
  need("paymentMethod", "Спосіб оплати");
  if (needsPaymentDetails(ticket)) {
    need("iban", "IBAN");
    need("taxId", "ІПН");
    need("receiverName", "ПІБ отримувача");
  }
  if (ticket.iban && !/^UA[A-Z0-9]{27}$/.test(ticket.iban)) errors.push("IBAN у форматі UA + 27 символів");
  if (ticket.taxId && !/^\d{10}$/.test(ticket.taxId)) errors.push("ІПН рівно 10 цифр");
  if (needsMainCrmReturnStatus(ticket) && !ticket.mainCrmReturnStatus) errors.push("Статус «Повернення товару»");
  if (needsMainCrmRefusalStatus(ticket) && !ticket.mainCrmReturnStatus) errors.push("Статус «Відмова» в CRM");
  return errors;
}

async function managerSubmit(id) {
  await saveTicketEdits(id, true);
  const ticket = state.tickets.find((item) => item.id === id);
  const errors = validateManager(ticket);
  if (errors.length) return showActionErrors(errors);
  const old = ticket.status;
  if (ticket.type === "Відмова на пошті" || (ticket.type === "Обмін" && ["Доплата клієнта", "Без доплат"].includes(ticket.exchangeResult))) {
    ticket.status = STATUSES.doneNoRefund;
  } else {
  ticket.status = STATUSES.review;
  }
  ticket.managerUserId = currentUser().id;
  ticket.reworkTarget = "";
  ticket.updatedAt = nowIso();
  if (isRemoteSession()) {
    try {
      await remoteTicketAction("managerSubmit", ticket);
      await loadRemoteData();
      render();
    } catch (error) {
      showActionErrors([error.message]);
    }
    return;
  }
  logAction(ticket, "змінено статус", old, ticket.status);
  saveState();
  render();
}

function showActionErrors(errors) {
  const target = byId("actionErrors");
  if (target) {
    target.textContent = `Заповніть або виправте: ${errors.join(", ")}`;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

async function headApprove(id) {
  const ticket = state.tickets.find((item) => item.id === id);
  const checks = Array.from({ length: headChecks(ticket).length }, (_, index) => byId(`check${index}`)?.checked);
  if (checks.some((item) => !item)) return showActionErrors(["усі пункти чек-листа"]);
  ticket.checklist = Object.fromEntries(checks.map((value, index) => [index, value]));
  const old = ticket.status;
  ticket.status = STATUSES.money;
  ticket.reworkTarget = "";
  ticket.reviewerUserId = currentUser().id;
  ticket.updatedAt = nowIso();
  if (isRemoteSession()) {
    try {
      await remoteTicketAction("headApprove", ticket);
      await loadRemoteData();
      render();
    } catch (error) {
      showActionErrors([error.message]);
    }
    return;
  }
  logAction(ticket, "подано на повернення", old, ticket.status);
  saveState();
  render();
}

async function headCompleteNoRefund(id) {
  const ticket = state.tickets.find((item) => item.id === id);
  const checks = Array.from({ length: headChecks(ticket).length }, (_, index) => byId(`check${index}`)?.checked);
  if (checks.some((item) => !item)) return showActionErrors(["усі пункти чек-листа"]);
  ticket.checklist = Object.fromEntries(checks.map((value, index) => [index, value]));
  const old = ticket.status;
  ticket.status = STATUSES.doneNoRefund;
  ticket.reworkTarget = "";
  ticket.reviewerUserId = currentUser().id;
  ticket.updatedAt = nowIso();
  if (isRemoteSession()) {
    try {
      await remoteTicketAction("saveTicket", ticket);
      await loadRemoteData();
      render();
    } catch (error) {
      showActionErrors([error.message]);
    }
    return;
  }
  logAction(ticket, "завершено без повернення", old, ticket.status);
  saveState();
  render();
}

async function headRework(id) {
  const text = prompt("Коментар доопрацювання");
  if (!text) return;
  const ticket = state.tickets.find((item) => item.id === id);
  const old = ticket.status;
  ticket.status = STATUSES.rework;
  ticket.reworkTarget = "office";
  ticket.reviewerUserId = currentUser().id;
  ticket.comments.unshift({ id: crypto.randomUUID(), type: "rework", text, author: currentUser().name, at: nowIso() });
  ticket.updatedAt = nowIso();
  if (isRemoteSession()) {
    try {
      await remoteTicketAction("headRework", ticket, { comment: text, reworkTarget: "office" });
      await loadRemoteData();
      render();
    } catch (error) {
      showActionErrors([error.message]);
    }
    return;
  }
  logAction(ticket, "відправлено на доопрацювання", old, text);
  saveState();
  render();
}

async function managerReworkWarehouse(id) {
  const text = prompt("Коментар для складу");
  if (!text) return;
  const ticket = state.tickets.find((item) => item.id === id);
  const old = ticket.status;
  ticket.status = STATUSES.rework;
  ticket.reworkTarget = "warehouse";
  ticket.managerUserId = currentUser().id;
  ticket.comments.unshift({ id: crypto.randomUUID(), type: "rework", text, author: currentUser().name, at: nowIso() });
  ticket.updatedAt = nowIso();
  if (isRemoteSession()) {
    try {
      await remoteTicketAction("headRework", ticket, { comment: text, reworkTarget: "warehouse" });
      await loadRemoteData();
      render();
    } catch (error) {
      showActionErrors([error.message]);
    }
    return;
  }
  logAction(ticket, "відправлено на доопрацювання складу", old, text);
  saveState();
  render();
}

async function deleteTicket(id) {
  const ticket = state.tickets.find((item) => item.id === id);
  if (!ticket || currentUser().role !== "admin") return;
  const reason = prompt("Причина видалення заявки");
  if (!reason) return;
  const old = ticket.status;
  ticket.status = STATUSES.deleted;
  ticket.reworkTarget = "";
  ticket.updatedAt = nowIso();
  ticket.updatedBy = currentUser().id;
  if (isRemoteSession()) {
    try {
      await remoteTicketAction("deleteTicket", ticket, { comment: reason });
      await loadRemoteData();
      setPage("tickets");
    } catch (error) {
      showActionErrors([error.message]);
    }
    return;
  }
  logAction(ticket, "видалено заявку", old, reason);
  saveState();
  setPage("tickets");
}

async function headReject(id) {
  const text = prompt("Причина відхилення");
  if (!text) return;
  const ticket = state.tickets.find((item) => item.id === id);
  const old = ticket.status;
  ticket.status = STATUSES.rejected;
  ticket.reworkTarget = "";
  ticket.reviewerUserId = currentUser().id;
  ticket.comments.unshift({ id: crypto.randomUUID(), type: "reject", text, author: currentUser().name, at: nowIso() });
  ticket.updatedAt = nowIso();
  if (isRemoteSession()) {
    try {
      await remoteTicketAction("headReject", ticket, { comment: text });
      await loadRemoteData();
      render();
    } catch (error) {
      showActionErrors([error.message]);
    }
    return;
  }
  logAction(ticket, "відхилено заявку", old, text);
  saveState();
  render();
}

async function markPaid(id) {
  const ticket = state.tickets.find((item) => item.id === id);
  if (needsPaymentDetails(ticket)) {
    const missing = ["iban", "taxId", "receiverName"].filter((key) => !ticket[key]);
    if (missing.length) return showActionErrors(["реквізити"]);
  }
  const old = ticket.status;
  ticket.status = STATUSES.paid;
  ticket.reworkTarget = "";
  ticket.accountantUserId = currentUser().id;
  ticket.paidAt = nowIso();
  ticket.updatedAt = nowIso();
  if (isRemoteSession()) {
    try {
      await remoteTicketAction("markPaid", ticket);
      await loadRemoteData();
      render();
    } catch (error) {
      showActionErrors([error.message]);
    }
    return;
  }
  logAction(ticket, "проведено повернення коштів", old, ticket.status);
  saveState();
  render();
}

function renderHistory(ticket) {
  const rows = state.logs.filter((log) => log.ticketId === ticket.id);
  return `<section class="section history-timeline">${rows.length ? rows.map(renderHistoryItem).join("") : `<div class="empty">Історія порожня</div>`}</section>`;
}

function renderHistoryItem(log) {
  const actor = [log.userName || "—", log.role || ""].filter(Boolean).join(" · ");
  const hasDiff = log.previousValue || log.newValue;
  return `
    <div class="history-event">
      <div class="history-dot"></div>
      <div class="history-content">
        <div class="history-title">${formatDateTime(log.at)} · ${escapeHtml(actor)}</div>
        <b>${escapeHtml(log.action)}</b>
        ${hasDiff ? `
          <div class="history-change">
            <div><span>Було</span><strong>${escapeHtml(log.previousValue || "—")}</strong></div>
            <div><span>Стало</span><strong>${escapeHtml(log.newValue || "—")}</strong></div>
          </div>
        ` : ""}
      </div>
    </div>
  `;
}

function renderComments(ticket) {
  return `
    <section class="section panel">
      <h3>Новий коментар</h3>
      <div class="field">
        <textarea id="newCommentText" placeholder="Додайте коментар до заявки"></textarea>
      </div>
      <div id="commentError" class="error"></div>
      <div class="actions">
        <button onclick="addTicketComment('${ticket.id}')">Додати коментар</button>
      </div>
    </section>
    <section class="section grid">
      ${ticket.comments?.length ? ticket.comments.map((comment) => renderCommentItem(comment)).join("") : `<div class="empty">Коментарів немає</div>`}
    </section>
  `;
}

function renderCommentItem(comment) {
  const title =
    comment.type === "rework"
      ? "Доопрацювання"
      : comment.type === "reject"
        ? "Відхилення"
        : comment.type === "delete"
          ? "Видалення"
        : "Коментар";
  return `<div class="comment"><b>${title}</b><p>${escapeHtml(comment.text)}</p><div class="meta">${formatDateTime(comment.at)} · ${escapeHtml(comment.author)}</div></div>`;
}

async function addTicketComment(id) {
  const ticket = state.tickets.find((item) => item.id === id);
  const input = byId("newCommentText");
  const error = byId("commentError");
  const text = input?.value.trim() || "";
  if (!text) {
    if (error) error.textContent = "Введіть текст коментаря";
    return;
  }
  ticket.comments.unshift({
    id: crypto.randomUUID(),
    type: "comment",
    text,
    author: currentUser().name,
    at: nowIso(),
  });
  ticket.updatedAt = nowIso();
  if (isRemoteSession()) {
    try {
      await remoteTicketAction("addComment", ticket, { comment: text, commentType: "comment" });
      await loadRemoteData();
      render();
    } catch (remoteError) {
      if (error) error.textContent = remoteError.message;
    }
    return;
  }
  logAction(ticket, "додано коментар", "", text);
  saveState();
  render();
}

function showToast(message) {
  const root = byId("toastRoot");
  if (!root) return;
  root.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    const liveRoot = byId("toastRoot");
    if (liveRoot) liveRoot.innerHTML = "";
  }, 2000);
}

function updateBrandSelectTheme() {
  document.querySelectorAll(".brand-select").forEach((select) => {
    select.classList.remove("brand-moow", "brand-lexie");
    if (select.value === "MOOW") select.classList.add("brand-moow");
    if (select.value === "LEXIE") select.classList.add("brand-lexie");
  });
}

function renderStats(user) {
  const tickets = filterStatsTickets(state.tickets.filter((ticket) => canSeeTicket(user, ticket) && ticket.status !== STATUSES.deleted));
  const totalAmount = tickets.filter((t) => [STATUSES.money, STATUSES.paid].includes(t.status)).reduce((sum, t) => sum + finalAmount(t), 0);
  const allReasons = [...state.reasons, ...(state.preShipmentReasons || PRE_SHIPMENT_REASONS)];
  const reasons = allReasons.map((reason) => [reason, tickets.filter((ticket) => ticket.reason === reason).length]).filter(([, count]) => count > 0);
  return `
    <section class="section">
      <h2>Статистика</h2>
      <div class="toolbar">
        <select onchange="setStatsPeriod(this.value)">
          ${option("all", "Увесь час", view.statsPeriod || "all")}
          ${option("week", "Цей тиждень", view.statsPeriod || "all")}
          ${option("month", "Цей місяць", view.statsPeriod || "all")}
          ${option("year", "Цей рік", view.statsPeriod || "all")}
          ${option("custom", "Вибрати дати", view.statsPeriod || "all")}
        </select>
        <input type="date" value="${view.statsFrom || ""}" onchange="setStatsDate('statsFrom', this.value)" />
        <input type="date" value="${view.statsTo || ""}" onchange="setStatsDate('statsTo', this.value)" />
        <button class="ghost" onclick="exportStatsCsv()">Експорт CSV</button>
      </div>
      <div class="stats-grid">
        <div class="stat-card"><span>Кількість заявок</span><strong>${tickets.length}</strong></div>
        <div class="stat-card"><span>Повернення</span><strong>${tickets.filter((t) => t.type === "Повернення").length}</strong></div>
        <div class="stat-card"><span>Обміни</span><strong>${tickets.filter((t) => t.type === "Обмін").length}</strong></div>
        <div class="stat-card"><span>Відмови</span><strong>${tickets.filter((t) => t.type === "Відмова на пошті").length}</strong></div>
        <div class="stat-card"><span>Відмови до відправки</span><strong>${tickets.filter((t) => t.type === "Відмова до відправки").length}</strong></div>
        <div class="stat-card"><span>Фінансова сума</span><strong>${money(totalAmount)}</strong></div>
      </div>
    </section>
    <section class="section panel">
      <h3>Статуси</h3>
      ${Object.values(STATUSES).filter((s) => s !== STATUSES.deleted).map((s) => `<div class="copy-row"><b>${s}</b><span>${tickets.filter((t) => t.status === s).length}</span></div>`).join("")}
    </section>
    <section class="section panel">
      <h3>Причини повернення</h3>
      ${reasons.length ? reasons.map(([reason, count]) => `<div class="copy-row"><b>${escapeHtml(reason)}</b><span>${count}</span></div>`).join("") : `<div class="empty">Поки немає даних по причинах</div>`}
    </section>
  `;
}

function renderLoginEvents() {
  const rows = filterLoginEvents(state.loginEvents || []);
  return `
    <section class="section">
      <h2>Журнал входів</h2>
      <div class="toolbar">
        <input id="loginEventSearch" placeholder="Пошук за логіном або пристроєм" value="${view.loginEventSearch || ""}" oninput="setLoginEventFilter('loginEventSearch', this.value)" />
        <input type="date" value="${view.loginEventFrom || ""}" onchange="setLoginEventFilter('loginEventFrom', this.value)" />
        <input type="date" value="${view.loginEventTo || ""}" onchange="setLoginEventFilter('loginEventTo', this.value)" />
      </div>
    </section>
    <section class="section grid">
      ${rows.length ? rows.map(renderLoginEventItem).join("") : `<div class="empty">Журнал входів порожній</div>`}
    </section>
  `;
}

function filterLoginEvents(events) {
  const search = (view.loginEventSearch || "").toLowerCase();
  const from = view.loginEventFrom ? new Date(`${view.loginEventFrom}T00:00:00`) : null;
  const to = view.loginEventTo ? new Date(`${view.loginEventTo}T23:59:59`) : null;
  return events.filter((event) => {
    const at = new Date(event.at);
    if (from && at < from) return false;
    if (to && at > to) return false;
    if (search) {
      const haystack = [event.login, event.userName, event.role, event.device, event.ipAddress].join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function renderLoginEventItem(event) {
  return `
    <div class="log-row">
      <div class="copy-row">
        <b>${escapeHtml(event.login || "—")}</b>
        <span class="login-status ${event.success ? "login-ok" : "login-fail"}">${event.success ? "Успішний" : "Невдалий"}</span>
      </div>
      <div class="history-line"><span>Користувач</span><strong>${escapeHtml(event.userName || "—")} · ${escapeHtml(event.role || "—")}</strong></div>
      <div class="history-line"><span>IP</span><strong>${escapeHtml(event.ipAddress || "—")}</strong></div>
      <div class="history-line"><span>Пристрій</span><strong>${escapeHtml(event.device || "—")}</strong></div>
      <div class="meta">${formatDateTime(event.at)}</div>
    </div>
  `;
}

function setLoginEventFilter(key, value) {
  view[key] = value;
  render();
}

function setStatsPeriod(period) {
  view.statsPeriod = period;
  render();
}

function setStatsDate(key, value) {
  view[key] = value;
  view.statsPeriod = "custom";
  render();
}

function exportStatsCsv() {
  const user = currentUser();
  const tickets = filterStatsTickets(state.tickets.filter((ticket) => canSeeTicket(user, ticket) && ticket.status !== STATUSES.deleted));
  const rows = [
    ["CRM ID", "Номер замовлення", "Бренд", "Тип", "Статус", "ПІБ", "Товар", "Причина", "ФОП складу", "ФОП менеджера", "Спосіб оплати", "Фінальна сума", "Менеджер", "Керівник", "Бухгалтер", "Створено", "Оновлено"],
    ...tickets.map((ticket) => [
      ticket.crmId || "",
      ticket.orderNumber || "",
      ticket.brand || "",
      ticket.type || "",
      ticket.status || "",
      ticket.clientName || "",
      ticket.returnedProduct || "",
      ticket.reason || "",
      ticket.warehouseFop || "",
      ticket.managerFop || "",
      ticket.paymentMethod || "",
      finalAmount(ticket).toFixed(2),
      userName(ticket.managerUserId),
      userName(ticket.reviewerUserId),
      userName(ticket.accountantUserId),
      ticket.createdAt || "",
      ticket.updatedAt || "",
    ]),
  ];
  downloadTextFile(`crm-stats-${todayKey()}.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
}

function csvCell(value) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function filterStatsTickets(tickets) {
  const period = view.statsPeriod || "all";
  if (period === "all") return tickets;
  const now = new Date();
  let from = null;
  let to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (period === "week") {
    const day = now.getDay() || 7;
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
  }
  if (period === "month") from = new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "year") from = new Date(now.getFullYear(), 0, 1);
  if (period === "custom") {
    from = view.statsFrom ? new Date(`${view.statsFrom}T00:00:00`) : null;
    to = view.statsTo ? new Date(`${view.statsTo}T23:59:59`) : null;
  }
  return tickets.filter((ticket) => {
    const created = new Date(ticket.createdAt);
    if (from && created < from) return false;
    if (to && created > to) return false;
    return true;
  });
}

function renderDirectories() {
  return `
    <section class="section panel">
      <h2>Довідники</h2>
      <h3>ФОП</h3>
      ${state.fops.map((item) => `<div class="copy-row"><b>${escapeHtml(item)}</b><button class="ghost" onclick="removeDirectoryItem('fops','${escapeAttr(item)}')">Видалити</button></div>`).join("")}
      <div class="toolbar section"><input id="newFop" placeholder="Новий ФОП" /><button onclick="addDirectoryItem('fops','newFop')">Додати</button></div>
      <h3 class="section">Причини повернення</h3>
      ${state.reasons.map((item) => `<div class="copy-row"><b>${escapeHtml(item)}</b><button class="ghost" onclick="removeDirectoryItem('reasons','${escapeAttr(item)}')">Видалити</button></div>`).join("")}
      <div class="toolbar section"><input id="newReason" placeholder="Нова причина" /><button onclick="addDirectoryItem('reasons','newReason')">Додати</button></div>
    </section>
  `;
}

function renderUsers() {
  return `
    <section class="section panel">
      <h2>Користувачі</h2>
      <div class="user-list">
        ${state.users.map((user) => renderUserEditor(user)).join("")}
      </div>
      <div class="form-grid section">
        ${inputField("newUserName", "Ім'я")}
        ${inputField("newUserLogin", "Логін")}
        ${inputField("newUserPassword", "Пароль")}
        ${selectField("newUserRole", "Роль", Object.keys(ROLES))}
      </div>
      <div class="actions"><button onclick="addUser()">Створити користувача</button></div>
    </section>
  `;
}

function renderUserEditor(user) {
  return `
    <section class="panel section user-editor">
      <div class="copy-row">
        <div>
          <b>${escapeHtml(user.name)}</b>
          <div class="meta">${escapeHtml(user.login)} · ${ROLES[user.role]} · ${user.active ? "Активний" : "Заблокований"}</div>
        </div>
      </div>
      <div class="form-grid">
        ${inputField(`userName-${user.id}`, "Ім'я", "text", user.name)}
        ${inputField(`userLogin-${user.id}`, "Логін", "text", user.login)}
        ${inputField(`userPassword-${user.id}`, "Пароль", "text", user.password)}
        ${selectField(`userRole-${user.id}`, "Роль", Object.keys(ROLES), user.role)}
        <div class="field full">
          <label>Доступ до брендів</label>
          <label class="checkbox"><input id="userBrand-${user.id}-MOOW" type="checkbox" ${user.brands.includes("MOOW") ? "checked" : ""} /><span>MOOW</span></label>
          <label class="checkbox"><input id="userBrand-${user.id}-LEXIE" type="checkbox" ${user.brands.includes("LEXIE") ? "checked" : ""} /><span>LEXIE</span></label>
        </div>
      </div>
      <div class="actions">
        <button class="ghost" onclick="updateUser('${user.id}')">Зберегти</button>
        <button class="ghost" onclick="toggleUser('${user.id}')">${user.active ? "Блокувати" : "Активувати"}</button>
        <button class="danger" onclick="deleteUser('${user.id}')">Видалити</button>
      </div>
    </section>
  `;
}

function renderSettings() {
  return `
    <section class="section panel">
      <h2>Налаштування</h2>
      <p class="hint">${isRemoteSession() ? "Дані CRM зберігаються у Supabase. Резервну копію може завантажити тільки адміністратор." : "Локальний прототип зберігає дані у браузері. Для нового тесту можна очистити локальні дані."}</p>
      <div class="actions">
        ${isRemoteSession() ? `<button onclick="downloadBackup()">Скачати резервну копію</button>` : `<button class="danger" onclick="resetDemo()">Очистити тестові дані</button>`}
      </div>
    </section>
  `;
}

async function downloadBackup() {
  if (!authToken) {
    alert("Потрібно увійти як адміністратор");
    return;
  }
  try {
    const response = await fetch("/api/backup", {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    if (!response.ok) throw new Error("Не вдалося створити резервну копію");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `crm-backup-${date}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(error.message);
  }
}

function addDirectoryItem(key, inputId) {
  const value = byId(inputId).value.trim();
  if (!value || state[key].includes(value)) return;
  state[key].push(value);
  logAction(null, `оновлено довідник ${key}`, "", value);
  saveState();
  render();
}

function removeDirectoryItem(key, value) {
  state[key] = state[key].filter((item) => item !== value);
  logAction(null, `оновлено довідник ${key}`, value, "");
  saveState();
  render();
}

async function addUser() {
  const user = {
    id: crypto.randomUUID(),
    name: byId("newUserName").value.trim(),
    login: byId("newUserLogin").value.trim(),
    password: byId("newUserPassword").value.trim() || "123456",
    role: byId("newUserRole").value,
    brands: BRANDS,
    active: true,
  };
  if (!user.name || !user.login || !user.role) return;
  if (state.users.some((item) => item.login === user.login)) return;
  if (isRemoteSession()) {
    try {
      await remoteUserRequest("POST", {
        login: user.login,
        password: user.password,
        name: user.name,
        role: user.role,
        brands: user.brands,
      });
      render();
    } catch (error) {
      alert(error.message);
    }
    return;
  }
  state.users.push(user);
  logAction(null, "створено користувача", "", user.login);
  saveState();
  render();
}

async function updateUser(id) {
  const user = state.users.find((item) => item.id === id);
  if (!user) return;
  const next = {
    name: byId(`userName-${id}`)?.value.trim() || "",
    login: byId(`userLogin-${id}`)?.value.trim() || "",
    password: byId(`userPassword-${id}`)?.value.trim() || "",
    role: byId(`userRole-${id}`)?.value || "",
    brands: BRANDS.filter((brand) => byId(`userBrand-${id}-${brand}`)?.checked),
  };
  if (!next.name || !next.login || (!isRemoteSession() && !next.password) || !next.role || !next.brands.length) return;
  if (state.users.some((item) => item.id !== id && item.login === next.login)) return;
  if (isRemoteSession()) {
    try {
      await remoteUserRequest("PATCH", {
        id,
        ...next,
        active: user.active,
      });
      render();
    } catch (error) {
      alert(error.message);
    }
    return;
  }
  const previous = `${user.name} · ${user.login} · ${user.role} · ${user.brands.join(",")}`;
  Object.assign(user, next);
  if (sessionUserId === user.id && !user.active) user.active = true;
  const updated = `${user.name} · ${user.login} · ${user.role} · ${user.brands.join(",")}`;
  logAction(null, "оновлено користувача", previous, updated);
  saveState();
  render();
}

async function toggleUser(id) {
  const user = state.users.find((item) => item.id === id);
  if (!user || user.id === sessionUserId) return;
  if (isRemoteSession()) {
    try {
      await remoteUserRequest("PATCH", {
        id,
        name: user.name,
        login: user.login,
        password: byId(`userPassword-${id}`)?.value.trim() || undefined,
        role: user.role,
        brands: user.brands,
        active: !user.active,
      });
      render();
    } catch (error) {
      alert(error.message);
    }
    return;
  }
  user.active = !user.active;
  logAction(null, user.active ? "активовано користувача" : "заблоковано користувача", user.login, String(user.active));
  saveState();
  render();
}

async function deleteUser(id) {
  const user = state.users.find((item) => item.id === id);
  if (!user || user.id === sessionUserId) return;
  if (!confirm(`Видалити користувача ${user.name}?`)) return;
  if (isRemoteSession()) {
    try {
      await remoteUserRequest("DELETE", { id });
      render();
    } catch (error) {
      alert(error.message);
    }
    return;
  }
  state.users = state.users.filter((item) => item.id !== id);
  logAction(null, "видалено користувача", user.login, "");
  saveState();
  render();
}

function resetDemo() {
  if (!confirm("Очистити всі заявки та повернути тестові дані?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = loadState();
  sessionUserId = null;
  localStorage.removeItem("moow_lexie_session");
  render();
}

async function login(event) {
  event.preventDefault();
  const loginValue = byId("loginInput").value.trim();
  const passwordValue = byId("passwordInput").value;
  byId("loginError").textContent = "";
  let user = null;
  try {
    user = await loginWithSupabase(loginValue, passwordValue);
  } catch (error) {
    user = null;
  }
  if (!user) user = state.users.find((item) => item.login === loginValue && item.password === passwordValue && item.active);
  if (!user) {
    await logLoginAttempt(loginValue, false);
    byId("loginError").textContent = "Невірний логін або пароль.";
    return;
  }
  await logLoginAttempt(loginValue, true);
  if (user.role === "admin" && isRemoteSession()) await loadRemoteData().catch(() => null);
  sessionUserId = user.id;
  localStorage.setItem("moow_lexie_session", user.id);
  view = { page: "dashboard", selectedId: null, filter: {}, mine: false, tab: "Картка" };
  render();
}

function logout() {
  sessionUserId = null;
  authToken = "";
  localStorage.removeItem("moow_lexie_session");
  localStorage.removeItem(AUTH_TOKEN_KEY);
  render();
}

function copyText(value) {
  navigator.clipboard?.writeText(value);
  showToast("Скопійовано");
}

function autoDate(input) {
  const digits = input.value.replace(/\D/g, "").slice(0, 8);
  let formatted = digits;
  if (digits.length > 4) formatted = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
  else if (digits.length > 2) formatted = `${digits.slice(0, 2)}.${digits.slice(2)}`;
  input.value = formatted;
}

function autoTime(input) {
  const digits = input.value.replace(/\D/g, "").slice(0, 4);
  input.value = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

Object.defineProperty(window, "view", {
  get: () => view,
  set: (nextValue) => {
    view = nextValue;
  },
  configurable: true,
});

Object.assign(window, {
  addDirectoryItem,
  addTicketComment,
  addUser,
  autoDate,
  autoTime,
  copyText,
  deleteTicket,
  deleteDraft,
  downloadBackup,
  exportStatsCsv,
  filterByStatus,
  headApprove,
  headCompleteNoRefund,
  headReject,
  headRework,
  login,
  logout,
  managerSubmit,
  managerReworkWarehouse,
  markPaid,
  removeDirectoryItem,
  render,
  resetDemo,
  saveNewTicket,
  saveTicketEdits,
  saveWarehouseDraft,
  setFilter,
  setLoginEventFilter,
  setPage,
  setStatsDate,
  setStatsPeriod,
  submitWarehouseDraft,
  switchManagerType,
  toggleMine,
  toggleUser,
  updateUser,
  updateBrandSelectTheme,
  updateCreateVisibility,
  updateDraftVisibility,
  deleteUser,
});

async function boot() {
  if (isRemoteSession()) {
    try {
      await loadRemoteData();
      const user = currentUser();
      if (user) await logLoginAttempt(user.login, true);
      if (user?.role === "admin") await loadRemoteData().catch(() => null);
    } catch (error) {
      authToken = "";
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }
  render();
}

boot();
