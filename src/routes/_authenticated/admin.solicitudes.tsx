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
import { Check, X, KeyRound } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { adminResolveResetRequest } from "@/lib/admin.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/admin/solicitudes")({ component: AdminSolicitudes });

type Req = {
  id: string;
  username: string;
  nota: string | null;
  estado: string;
  created_at: string;
  resolved_at: string | null;
};

function AdminSolicitudes() {
  const { data: me, isLoading } = useUserRole();
  const qc = useQueryClient();
  const [approve, setApprove] = useState<Req | null>(null);
  const resolveFn = useServerFn(adminResolveResetRequest);

  const { data: requests = [] } = useQuery({
    queryKey: ["reset-requests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("password_reset_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as Req[];
    },
  });

  if (isLoading) return <AppShell title="Solicitudes"><div>…</div></AppShell>;
  if (!me?.isAdmin) return <Navigate to="/" />;

  async function rechazar(r: Req) {
    if (!confirm(`¿Rechazar solicitud de ${r.username}?`)) return;
    try {
      await resolveFn({ data: { requestId: r.id, action: "rechazar" } });
      toast.success("Solicitud rechazada");
      qc.invalidateQueries({ queryKey: ["reset-requests"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
  }

  const pendientes = requests.filter((r) => r.estado === "pendiente");
  const resueltas = requests.filter((r) => r.estado !== "pendiente");

  return (
    <AppShell title="Solicitudes de contraseña">
      <div className="mx-auto max-w-3xl space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pendientes ({pendientes.length})
          </h2>
          {pendientes.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
              No hay solicitudes pendientes.
            </div>
          ) : (
            <div className="divide-y rounded-lg border bg-card">
              {pendientes.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="font-semibold">@{r.username}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("es-ES")}
                    </div>
                    {r.nota && <div className="mt-1 text-sm">{r.nota}</div>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setApprove(r)}>
                      <KeyRound className="mr-1.5 h-4 w-4" /> Aprobar y asignar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => rechazar(r)}>
                      <X className="mr-1.5 h-4 w-4" /> Rechazar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {resueltas.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Historial
            </h2>
            <div className="divide-y rounded-lg border bg-card text-sm">
              {resueltas.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3">
                  <div>
                    <div>@{r.username}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("es-ES")}
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
                    r.estado === "aprobada" ? "bg-green-500/15 text-green-700 dark:text-green-400"
                    : "bg-red-500/15 text-red-700 dark:text-red-400"
                  }`}>
                    {r.estado === "aprobada" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {r.estado}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <ApproveDialog
        req={approve}
        onOpenChange={(v) => !v && setApprove(null)}
        onApprove={async (pw) => {
          if (!approve) return;
          try {
            await resolveFn({ data: { requestId: approve.id, action: "aprobar", newPassword: pw } });
            toast.success(`Contraseña de @${approve.username} actualizada`);
            qc.invalidateQueries({ queryKey: ["reset-requests"] });
            qc.invalidateQueries({ queryKey: ["employee-passwords"] });
            setApprove(null);
          } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
        }}
      />
    </AppShell>
  );
}

function ApproveDialog({ req, onOpenChange, onApprove }: {
  req: Req | null;
  onOpenChange: (v: boolean) => void;
  onApprove: (pw: string) => void;
}) {
  const [pw, setPw] = useState("");
  return (
    <Dialog open={!!req} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nueva contraseña para @{req?.username}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onApprove(pw); setPw(""); }} className="space-y-3">
          <div>
            <Label>Contraseña</Label>
            <Input required minLength={4} placeholder="1984" value={pw} onChange={(e) => setPw(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">
              Comunícasela al empleado. Quedará visible en la lista de Empleados.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">Guardar y aprobar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
