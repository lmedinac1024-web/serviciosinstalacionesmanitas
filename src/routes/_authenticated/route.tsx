import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const sessionPromise = supabase.auth.getSession().catch(() => null);

    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) return { user: data.user };
    } catch {
      // En móviles con conexión inestable, al volver de cámara/galería puede
      // fallar la verificación remota y el usuario acababa expulsado del formulario.
    }

    const sessionResult = await sessionPromise;
    const sessionUser = sessionResult?.data.session?.user;
    if (sessionUser) return { user: sessionUser };

    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
