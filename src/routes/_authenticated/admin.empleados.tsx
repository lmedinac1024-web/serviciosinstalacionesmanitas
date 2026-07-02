import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Key } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { adminCreateEmployee, adminResetPassword, adminDeleteEmployee } from "@/lib/admin.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/admin/empleados")({ component: AdminEmpleados });

type Profile = { user_id: string; username: string; display_name: string | null };

function AdminEmpleados() {
  const { data: me, isLoading } = useUserRole();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState<Profile | null>(null);
  const createFn = useServerFn(adminCreateEmployee);
  const resetFn = useServerFn(adminResetPassword);
  const deleteFn = useServerFn(adminDeleteEmployee);

  const { data: empleados = [] } = useQuery({
    queryKey: ["empleados-list"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "empleado");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as Profile[];
      const { data } = await supabase.from("profiles").select("user_id, username, display_name").in("user_id", ids);
      return (data ?? []) as Profile[];
    },
  });

  if (isLoading) return <AppShell title="Empleados"><div>…</div></AppShell>;
  if (!me?.isAdmin) return <Navigate to="/" />;

  async function borrar(p: Profile) {
    if (!confirm(`¿Eliminar empleado ${p.username}? Sus trabajos quedarán sin asignar.`)) return;
    try {
      await deleteFn({ data: { userId: p.user_id } });
      toast.success("Empleado eliminado");
      qc.invalidateQueries({ queryKey: ["empleados-list"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
  }

  return (
    <AppShell title="Empleados">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Nuevo empleado</Button>
        </div>

        {empleados.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            Sin empleados. Crea el primero.
          </div>
        ) : (
          <div className="divide-y rounded-lg border bg-card">
            {empleados.map((p) => (
              <div key={p.user_id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-semibold">{p.display_name || p.username}</div>
                  <div className="text-xs text-muted-foreground">@{p.username}</div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setPwOpen(p)}>
                    <Key className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => borrar(p)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <CreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreate={async (form) => {
            try {
              await createFn({ data: form });
              toast.success(`Empleado ${form.username} creado`);
              qc.invalidateQueries({ queryKey: ["empleados-list"] });
              setCreateOpen(false);
            } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
          }}
        />

        <PasswordDialog
          profile={pwOpen}
          onOpenChange={(v) => !v && setPwOpen(null)}
          onSave={async (password) => {
            if (!pwOpen) return;
            try {
              await resetFn({ data: { userId: pwOpen.user_id, password } });
              toast.success("Contraseña actualizada");
              setPwOpen(null);
            } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
          }}
        />

      </div>
    </AppShell>
  );
}

function CreateDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (v: boolean) => void; onCreate: (f: { username: string; password: string; displayName?: string }) => void }) {
  const [f, setF] = useState({ username: "", password: "", displayName: "" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo empleado</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onCreate(f); }} className="space-y-3">
          <div><Label>Usuario *</Label><Input required placeholder="user1" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
          <div><Label>Nombre visible</Label><Input placeholder="Juan Pérez" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></div>
          <div><Label>Contraseña *</Label><Input required minLength={4} placeholder="1984" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">Crear</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ profile, onOpenChange, onSave }: { profile: Profile | null; onOpenChange: (v: boolean) => void; onSave: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  return (
    <Dialog open={!!profile} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cambiar contraseña de {profile?.username}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSave(pw); setPw(""); }} className="space-y-3">
          <div><Label>Nueva contraseña</Label><Input required minLength={4} value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

