import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const sessionPromise = supabase.auth.getSession().catch(() => null);
    let user: { id: string } | null = null;

    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) user = data.user;
    } catch {
      // En móviles con conexión inestable la verificación remota puede fallar.
    }

    if (!user) {
      const sessionResult = await sessionPromise;
      user = sessionResult?.data.session?.user ?? null;
    }

    if (!user) throw redirect({ to: "/auth" });

    // Bloquear empleados desactivados
    try {
      const { data: prof } = await supabase.from("profiles").select("activo").eq("user_id", user.id).maybeSingle();
      if (prof && prof.activo === false) {
        await supabase.auth.signOut();
        throw redirect({ to: "/auth" });
      }
    } catch (e) {
      // Si es un redirect, propagarlo. Si es otro error de red, no bloquear.
      if (e && typeof e === "object" && "to" in e) throw e;
    }

    return { user };
  },
  component: () => <Outlet />,
});
