import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Key, Eye, EyeOff, Loader2 } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { adminCreateEmployee, adminResetPassword, adminDeleteEmployee } from "@/lib/admin.functions";
import { useServerFn } from "@tanstack/react-start";
import { formatEUR, jobTotal, type Job } from "@/lib/jobs";

export const Route = createFileRoute("/_authenticated/admin/empleados")({ component: AdminEmpleados });

type Profile = { user_id: string; username: string; display_name: string | null; activo: boolean };

function AdminEmpleados() {
  const { data: me } = useUserRole();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState<Profile | null>(null);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const createFn = useServerFn(adminCreateEmployee);
  const resetFn = useServerFn(adminResetPassword);
  const deleteFn = useServerFn(adminDeleteEmployee);

  const { data: empleados = [], isLoading } = useQuery({
    queryKey: ["admin", "empleados-full"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const roleMap = new Map<string, string[]>();
      for (const r of roles ?? []) {
        const arr = roleMap.get(r.user_id) ?? [];
        arr.push(r.role as string);
        roleMap.set(r.user_id, arr);
      }
      const ids = Array.from(roleMap.keys());
      if (ids.length === 0) return [] as (Profile & { roles: string[] })[];
      const { data } = await supabase.from("profiles").select("user_id, username, display_name, activo").in("user_id", ids);
      return ((data ?? []) as Profile[]).map((p) => ({ ...p, roles: roleMap.get(p.user_id) ?? [] }));
    },
  });

  const { data: passwords = {} } = useQuery({
    queryKey: ["employee-passwords"],
    queryFn: async () => {
      const { data } = await supabase.rpc("admin_list_employee_passwords");
      const map: Record<string, string> = {};
      for (const r of (data ?? []) as Array<{ user_id: string; password_plain: string }>) {
        map[r.user_id] = r.password_plain;
      }
      return map;
    },
  });

  const { data: allJobs = [] } = useQuery({
    queryKey: ["admin", "jobs", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("servicios").select("*");
      return ((data ?? []) as Job[]).filter((j) => !j.eliminado_logico);
    },
  });

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthStartISO = monthStart.toISOString();

  const stats = useMemo(() => {
    const map = new Map<string, { obras: number; realizados: number; ganadoMes: number }>();
    for (const j of allJobs) {
      const uid = j.empleado_id ?? j.user_id;
      if (!uid) continue;
      const cur = map.get(uid) ?? { obras: 0, realizados: 0, ganadoMes: 0 };
      cur.obras += 1;
      if (j.estado === "realizado") cur.realizados += 1;
      if (j.hora_fin && j.hora_fin >= monthStartISO) cur.ganadoMes += jobTotal(j);
      map.set(uid, cur);
    }
    return map;
  }, [allJobs, monthStartISO]);

  async function toggleActivo(p: Profile, activo: boolean) {
    const { error } = await supabase.from("profiles").update({ activo }).eq("user_id", p.user_id);
    if (error) return toast.error(error.message);
    toast.success(activo ? "Empleado activado" : "Empleado desactivado");
    qc.invalidateQueries({ queryKey: ["admin", "empleados-full"] });
  }

  async function borrar(p: Profile) {
    if (!confirm(`¿Eliminar empleado ${p.username}? Sus trabajos quedarán sin asignar.`)) return;
    try {
      await deleteFn({ data: { userId: p.user_id } });
      toast.success("Empleado eliminado");
      qc.invalidateQueries({ queryKey: ["admin", "empleados-full"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
  }

  return (
    <AdminShell
      title="Empleados"
      subtitle={`${empleados.length} usuario(s)`}
      actions={<Button onClick={() => setCreateOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Nuevo usuario</Button>}
    >
      {isLoading ? (
        <div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : empleados.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Sin empleados. Crea el primero.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Usuario</th>
                <th className="px-4 py-2.5 text-left font-semibold">Rol</th>
                <th className="px-4 py-2.5 text-left font-semibold">Contraseña</th>
                <th className="px-4 py-2.5 text-right font-semibold">Obras</th>
                <th className="px-4 py-2.5 text-right font-semibold">Realizadas</th>
                <th className="px-4 py-2.5 text-right font-semibold">Ganado (mes)</th>
                <th className="px-4 py-2.5 text-center font-semibold">Activo</th>
                <th className="px-4 py-2.5 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {empleados.map((p) => {
                const pw = passwords[p.user_id];
                const shown = reveal[p.user_id];
                const s = stats.get(p.user_id) ?? { obras: 0, realizados: 0, ganadoMes: 0 };
                return (
                  <tr key={p.user_id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{p.display_name || p.username}</div>
                      <div className="text-xs text-muted-foreground">@{p.username}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.roles.includes("super_admin") && <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">SUPER</span>}
                        {p.roles.includes("admin") && !p.roles.includes("super_admin") && <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold">ADMIN</span>}
                        {p.roles.includes("empleado") && <span className="rounded border px-1.5 py-0.5 text-[10px]">EMPLEADO</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {pw ? (
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{shown ? pw : "••••••••"}</code>
                          <button type="button" className="text-muted-foreground hover:text-foreground"
                            onClick={() => setReveal((r) => ({ ...r, [p.user_id]: !r[p.user_id] }))}>
                            {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">Sin registrar</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.obras}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-success">{s.realizados}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatEUR(s.ganadoMes)}</td>
                    <td className="px-4 py-3 text-center">
                      <Switch checked={p.activo} onCheckedChange={(v) => toggleActivo(p, v)} disabled={p.user_id === me?.userId} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setPwOpen(p)}><Key className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => borrar(p)} disabled={p.user_id === me?.userId}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        canCreateAdmin={!!me?.isSuperAdmin}
        onCreate={async (form) => {
          try {
            await createFn({ data: form });
            toast.success(`Usuario ${form.username} creado`);
            qc.invalidateQueries({ queryKey: ["admin", "empleados-full"] });
            qc.invalidateQueries({ queryKey: ["employee-passwords"] });
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
            qc.invalidateQueries({ queryKey: ["employee-passwords"] });
            setPwOpen(null);
          } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
        }}
      />
    </AdminShell>
  );
}

function CreateDialog({ open, onOpenChange, onCreate, canCreateAdmin }: {
  open: boolean; onOpenChange: (v: boolean) => void; canCreateAdmin: boolean;
  onCreate: (f: { username: string; password: string; displayName?: string; role: "empleado" | "admin" }) => void;
}) {
  const [f, setF] = useState<{ username: string; password: string; displayName: string; role: "empleado" | "admin" }>({ username: "", password: "", displayName: "", role: "empleado" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo usuario</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onCreate(f); }} className="space-y-3">
          <div><Label>Usuario *</Label><Input required placeholder="user1" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
          <div><Label>Nombre visible</Label><Input placeholder="Juan Pérez" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></div>
          <div><Label>Contraseña *</Label><Input required minLength={4} placeholder="1984" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          <div>
            <Label>Rol *</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setF({ ...f, role: "empleado" })} className={`rounded-md border px-3 py-2 text-sm font-medium ${f.role === "empleado" ? "border-primary bg-primary/10 text-primary" : "bg-background"}`}>Empleado</button>
              <button type="button" disabled={!canCreateAdmin} onClick={() => setF({ ...f, role: "admin" })} className={`rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed ${f.role === "admin" ? "border-primary bg-primary/10 text-primary" : "bg-background"}`}>Admin</button>
            </div>
            {!canCreateAdmin && <div className="mt-1 text-[11px] text-muted-foreground">Solo un super admin puede crear administradores.</div>}
          </div>
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
