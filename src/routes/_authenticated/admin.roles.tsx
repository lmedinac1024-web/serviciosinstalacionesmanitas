import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldCheck, Shield, User } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { superListUsers, superSetRole } from "@/lib/admin.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/admin/roles")({
  component: AdminRoles,
});

function AdminRoles() {
  const { data: me, isLoading } = useUserRole();
  const qc = useQueryClient();
  const listFn = useServerFn(superListUsers);
  const setFn = useServerFn(superSetRole);

  const { data: users = [], isFetching } = useQuery({
    queryKey: ["super-users"],
    queryFn: () => listFn(),
    enabled: !!me?.isSuperAdmin,
  });

  if (isLoading) return <AppShell title="Roles"><div>…</div></AppShell>;
  if (!me?.isSuperAdmin) return <Navigate to="/" />;

  async function toggle(userId: string, role: "admin" | "super_admin", grant: boolean) {
    try {
      await setFn({ data: { userId, role, grant } });
      toast.success(grant ? `Concedido ${role}` : `Revocado ${role}`);
      qc.invalidateQueries({ queryKey: ["super-users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <AppShell title="Roles">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <div className="font-medium text-foreground">Jerarquía de roles</div>
              <ul className="mt-1 list-disc pl-5">
                <li><b>Super Admin</b>: gestiona la app y los roles de otros usuarios.</li>
                <li><b>Admin</b>: gestiona el equipo (empleados, clientes, categorías, Telegram).</li>
                <li><b>Empleado</b>: sólo ve y ejecuta sus servicios.</li>
              </ul>
            </div>
          </div>
        </div>

        {isFetching && <div className="text-sm text-muted-foreground">Cargando…</div>}

        <div className="divide-y rounded-lg border bg-card">
          {users.map((u) => {
            const isSuper = u.roles.includes("super_admin");
            const isAdmin = u.roles.includes("admin");
            const isSelf = u.userId === me.userId;
            return (
              <div key={u.userId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold">
                    <User className="h-4 w-4" />
                    {u.displayName || u.username}
                    {isSelf && <Badge variant="outline" className="text-[10px]">Tú</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">@{u.username}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {isSuper && <Badge className="bg-primary">Super Admin</Badge>}
                    {isAdmin && <Badge variant="secondary">Admin</Badge>}
                    {u.roles.includes("empleado") && <Badge variant="outline">Empleado</Badge>}
                    {u.roles.length === 0 && <Badge variant="outline" className="text-destructive">Sin rol</Badge>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={isAdmin ? "outline" : "default"}
                    onClick={() => toggle(u.userId, "admin", !isAdmin)}
                  >
                    <Shield className="mr-1.5 h-4 w-4" />
                    {isAdmin ? "Quitar admin" : "Hacer admin"}
                  </Button>
                  <Button
                    size="sm"
                    variant={isSuper ? "outline" : "default"}
                    disabled={isSuper && isSelf}
                    onClick={() => toggle(u.userId, "super_admin", !isSuper)}
                  >
                    <ShieldCheck className="mr-1.5 h-4 w-4" />
                    {isSuper ? "Quitar super" : "Hacer super"}
                  </Button>
                </div>
              </div>
            );
          })}
          {!isFetching && users.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">Sin usuarios.</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
