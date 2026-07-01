import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DOMAIN = "trabajos.local";

async function ensureAdmin(ctx: { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const adminCreateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { username: string; password: string; displayName?: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const username = data.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (!username) throw new Error("Usuario inválido");
    if (!data.password || data.password.length < 4) throw new Error("Contraseña muy corta (mín 4)");
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
      { user_id: userId, role: "empleado" },
      { onConflict: "user_id,role" },
    );
    return { ok: true, userId };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    if (!data.password || data.password.length < 4) throw new Error("Contraseña muy corta");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw error;
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
