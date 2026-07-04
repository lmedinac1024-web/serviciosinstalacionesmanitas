import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DOMAIN = "trabajos.local";

async function ensureAdmin(ctx: { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string }) {
  const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" }),
  ]);
  if (!isAdmin && !isSuper) throw new Error("Forbidden");
}

function normalizeRole(r?: string): "empleado" | "admin" | "super_admin" {
  const v = (r ?? "empleado").toString().trim().toLowerCase();
  if (v === "admin") return "admin";
  if (v === "super_admin" || v === "superadmin") return "super_admin";
  return "empleado";
}

export const adminCreateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { username: string; password: string; displayName?: string; role?: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const requestedRole = normalizeRole(data.role);
    if (requestedRole !== "empleado") {
      // Only super_admin can create admins / super_admins
      const { data: isSuper } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
      if (!isSuper) throw new Error("Solo un super admin puede crear administradores");
    }
    const username = data.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (!username) throw new Error("Usuario inválido");
    if (!data.password || data.password.length < 6) throw new Error("Contraseña muy corta (mín 6)");
    const email = `${username}@${DOMAIN}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { username, display_name: data.displayName || username },
    });
    if (error) throw error;
    const userId = created.user?.id;
    if (!userId) throw new Error("No se pudo crear el usuario");
    // El trigger ya creó profile y rol empleado; forzamos por si acaso
    await supabaseAdmin.from("profiles").upsert({
      user_id: userId,
      username,
      display_name: data.displayName || username,
    });
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: userId, role: requestedRole },
      { onConflict: "user_id,role" },
    );
    await supabaseAdmin.from("employee_passwords").upsert({
      user_id: userId,
      password_plain: data.password,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    return { ok: true, userId };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    if (!data.password || data.password.length < 6) throw new Error("Contraseña muy corta (mín 6)");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw error;
    await supabaseAdmin.from("employee_passwords").upsert({
      user_id: data.userId,
      password_plain: data.password,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    });
    return { ok: true };
  });

export const adminResolveResetRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; action: "aprobar" | "rechazar"; newPassword?: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req, error: qErr } = await supabaseAdmin
      .from("password_reset_requests")
      .select("id, username, estado")
      .eq("id", data.requestId)
      .maybeSingle();
    if (qErr) throw qErr;
    if (!req) throw new Error("Solicitud no encontrada");
    if (req.estado !== "pendiente") throw new Error("Solicitud ya resuelta");

    if (data.action === "aprobar") {
      if (!data.newPassword || data.newPassword.length < 6) throw new Error("Contraseña muy corta (mín 6)");
      const uname = req.username.trim().toLowerCase();
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("username", uname)
        .maybeSingle();
      if (!prof?.user_id) throw new Error("Usuario no existe");
      const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(prof.user_id, {
        password: data.newPassword,
      });
      if (upErr) throw upErr;
      await supabaseAdmin.from("employee_passwords").upsert({
        user_id: prof.user_id,
        password_plain: data.newPassword,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      });
    }

    await supabaseAdmin
      .from("password_reset_requests")
      .update({
        estado: data.action === "aprobar" ? "aprobada" : "rechazada",
        resolved_at: new Date().toISOString(),
        resolved_by: context.userId,
      })
      .eq("id", data.requestId);
    return { ok: true };
  });


export const adminDeleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    if (data.userId === context.userId) throw new Error("No puedes borrarte a ti mismo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw error;
    return { ok: true };
  });

async function ensureSuperAdmin(ctx: { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  if (!data) throw new Error("Solo super admin");
}

export const superListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("user_id, username, display_name"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    const byUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role as string);
      byUser.set(r.user_id, arr);
    }
    return (profiles ?? []).map((p) => ({
      userId: p.user_id,
      username: p.username,
      displayName: p.display_name,
      roles: byUser.get(p.user_id) ?? [],
    }));
  });

export const superSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: "admin" | "super_admin" | "empleado"; grant: boolean }) => d)
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.userId === context.userId && data.role === "super_admin" && !data.grant) {
      throw new Error("No puedes quitarte super_admin a ti mismo");
    }
    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw error;
    }
    return { ok: true };
  });
