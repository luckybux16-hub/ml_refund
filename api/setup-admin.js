import { createServiceClient, json, loginToEmail } from "./_lib/supabase.js";

function getBootstrapEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const login = getBootstrapEnv("BOOTSTRAP_ADMIN_LOGIN");
    const password = getBootstrapEnv("BOOTSTRAP_ADMIN_PASSWORD");
    const name = process.env.BOOTSTRAP_ADMIN_NAME || "Головний адміністратор";
    const email = loginToEmail(login);
    const supabase = createServiceClient();

    const { data: existingProfile } = await supabase
      .from("app_users")
      .select("id, login, role")
      .eq("login", login)
      .maybeSingle();

    if (existingProfile) {
      return json(res, 200, {
        ok: true,
        message: `Admin user ${login} already exists.`,
      });
    }

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

    return json(res, 200, {
      ok: true,
      message: `Admin user ${login} is ready.`,
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error.message || "Failed to create admin user",
    });
  }
}
