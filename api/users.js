import { createServiceClient, getAuthenticatedProfile, json, loginToEmail, readJson } from "./_lib/supabase.js";

function requireAdmin(profile) {
  if (profile.role !== "admin") throw new Error("Forbidden");
}

export default async function handler(req, res) {
  try {
    const { profile } = await getAuthenticatedProfile(req);
    requireAdmin(profile);
    const supabase = createServiceClient();

    if (req.method === "POST") {
      const body = await readJson(req);
      const email = loginToEmail(body.login);
      const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { login: body.login },
      });
      if (createError) return json(res, 400, { error: createError.message });

      const { error: profileError } = await supabase.from("app_users").insert({
        id: createdUser.user.id,
        login: body.login,
        email,
        name: body.name,
        role: body.role,
        brands: body.brands,
        active: true,
        created_by: profile.id,
        updated_by: profile.id,
      });

      if (profileError) return json(res, 400, { error: profileError.message });
      return json(res, 201, { ok: true });
    }

    if (req.method === "PATCH") {
      const body = await readJson(req);
      const email = loginToEmail(body.login);

      const authPayload = {
        email,
        user_metadata: { login: body.login },
      };
      if (body.password) authPayload.password = body.password;
      const { error: authError } = await supabase.auth.admin.updateUserById(body.id, authPayload);
      if (authError) return json(res, 400, { error: authError.message });

      const { error: profileError } = await supabase
        .from("app_users")
        .update({
          login: body.login,
          email,
          name: body.name,
          role: body.role,
          brands: body.brands,
          active: body.active,
          updated_by: profile.id,
        })
        .eq("id", body.id);

      if (profileError) return json(res, 400, { error: profileError.message });
      return json(res, 200, { ok: true });
    }

    if (req.method === "DELETE") {
      const body = await readJson(req);
      if (body.id === profile.id) return json(res, 400, { error: "Cannot delete current admin" });

      const { error: profileError } = await supabase.from("app_users").delete().eq("id", body.id);
      if (profileError) return json(res, 400, { error: profileError.message });

      const { error: authError } = await supabase.auth.admin.deleteUser(body.id);
      if (authError) return json(res, 400, { error: authError.message });

      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return json(res, error.message === "Forbidden" ? 403 : 401, { error: error.message || "Unauthorized" });
  }
}
