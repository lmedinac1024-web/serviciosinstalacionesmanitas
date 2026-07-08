import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;

    const sessionPromise = supabase.auth.getSession().catch(() => null);
    let user: { id: string } | null = null;

    // En offline no intentes la verificación remota: usa directamente la sesión persistida.
    if (!isOffline) {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data.user) user = data.user;
      } catch {
        // En móviles con conexión inestable la verificación remota puede fallar.
      }
    }

    if (!user) {
      const sessionResult = await sessionPromise;
      user = sessionResult?.data.session?.user ?? null;
    }

    // Última pasada: escanear localStorage por si `getSession` no devolvió nada
    // pero el token está persistido (p.ej. tras un refresh offline).
    if (!user && typeof window !== "undefined") {
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
          const raw = window.localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          const userId = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
          if (typeof userId === "string" && userId.length > 0) {
            user = { id: userId };
            break;
          }
        }
      } catch { /* noop */ }
    }

    if (!user) {
      // Sin sesión y offline: mantenemos al usuario en /auth para que reintente
      // cuando vuelva la conexión. Con conexión, redirigimos igual.
      throw redirect({ to: "/auth" });
    }

    // Bloquear empleados desactivados sólo si hay conexión (offline confiamos
    // en la última caché y dejamos entrar para poder encolar).
    if (!isOffline) {
      try {
        const { data: prof } = await supabase.from("profiles").select("activo").eq("user_id", user.id).maybeSingle();
        if (prof && prof.activo === false) {
          await supabase.auth.signOut();
          throw redirect({ to: "/auth" });
        }
      } catch (e) {
        if (e && typeof e === "object" && "to" in e) throw e;
      }
    }

    return { user };
  },
  component: () => <Outlet />,
});
