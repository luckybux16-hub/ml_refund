import { createServiceClient, loginToEmail } from "../api/_lib/supabase.js";

const supabase = createServiceClient();
const login = process.env.BOOTSTRAP_ADMIN_LOGIN || "admin";
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const name = process.env.BOOTSTRAP_ADMIN_NAME || "Головний адміністратор";

if (!password) {
  throw new Error("Set BOOTSTRAP_ADMIN_PASSWORD before running the bootstrap script.");
}

const email = loginToEmail(login);

const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { login },
});

if (createError) throw createError;

const { error: profileError } = await supabase.from("app_users").upsert({
  id: createdUser.user.id,
  login,
  email,
  name,
  role: "admin",
  brands: ["MOOW", "LEXIE"],
  active: true,
});

if (profileError) throw profileError;

console.log(`Admin user ${login} is ready.`);
