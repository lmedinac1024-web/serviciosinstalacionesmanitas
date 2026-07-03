import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useUserRole } from "@/hooks/useUserRole";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { data: me, isLoading } = useUserRole();
  if (isLoading) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Cargando…</div>;
  }
  if (!me?.isAdmin) return <Navigate to="/" />;
  return <Outlet />;
}
