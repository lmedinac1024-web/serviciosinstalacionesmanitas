import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  formatEUR, jobTotal, displayStatus, statusColorClass, googleMapsUrl, whatsappUrl,
  type Job, type JobStatus,
} from "@/lib/jobs";
import { Search, Plus, Pencil, Trash2, MapPin, MessageCircle, ExternalLink, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/obras")({ component: AdminObras });

const ESTADOS: { value: JobStatus | "todos" | "activos" | "cancelados"; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "activos", label: "Activos (pendiente + en curso)" },
  { value: "pendiente", label: "Pendiente" },
  { value: "en_proceso", label: "En curso" },
  { value: "realizado", label: "Realizado" },
  { value: "cancelados", label: "Cancelados (todos)" },
];

type Empleado = { user_id: string; username: string; display_name: string | null };

function AdminObras() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filtros, setFiltros] = useState({
    desde: "", hasta: "", empleado: "todos", estado: "todos" as string, texto: "",
    incluirAnulados: false,
  });
  const [anular, setAnular] = useState<Job | null>(null);

  const { data: obras = [], isLoading } = useQuery({
    queryKey: ["admin", "obras"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servicios").select("*").order("fecha", { ascending: false }).order("hora_programada", { ascending: false });
      if (error) throw error;
      return data as Job[];
    },
  });

  const { data: empleados = [] } = useQuery({
    queryKey: ["admin", "empleados-select"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, username, display_name");
      return (data ?? []) as Empleado[];
    },
  });

  const empleadoName = (id: string | null) => {
    if (!id) return "—";
    const e = empleados.find((x) => x.user_id === id);
    return e?.display_name || e?.username || id.slice(0, 6);
  };

  const filtered = useMemo(() => {
    const t = filtros.texto.trim().toLowerCase();
    return obras.filter((o) => {
      if (!filtros.incluirAnulados && o.eliminado_logico) return false;
      if (filtros.desde && o.fecha < filtros.desde) return false;
      if (filtros.hasta && o.fecha > filtros.hasta) return false;
      if (filtros.empleado !== "todos" && o.empleado_id !== filtros.empleado) return false;
      if (filtros.estado === "activos" && !(o.estado === "pendiente" || o.estado === "en_proceso")) return false;
      else if (filtros.estado === "cancelados" && !o.estado.startsWith("cancelado")) return false;
      else if (!["todos", "activos", "cancelados"].includes(filtros.estado) && o.estado !== filtros.estado) return false;
      if (t) {
        const hay = `${o.cliente} ${o.direccion} ${o.referencia ?? ""} ${o.telefono_cliente ?? ""}`.toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [obras, filtros]);

  const totales = useMemo(() => {
    const g = filtered.reduce((s, j) => s + jobTotal(j), 0);
    return { count: filtered.length, ganado: g };
  }, [filtered]);

  async function confirmarAnulacion(motivo: string) {
    if (!anular) return;
    if (!motivo.trim()) return toast.error("Motivo obligatorio");
    const { error } = await supabase.from("servicios").update({
      eliminado_logico: true,
      motivo_anulacion: motivo.trim(),
    }).eq("id", anular.id);
    if (error) return toast.error(error.message);
    toast.success("Obra anulada");
    qc.invalidateQueries({ queryKey: ["admin", "obras"] });
    qc.invalidateQueries({ queryKey: ["admin", "jobs", "all"] });
    setAnular(null);
  }

  return (
    <AdminShell
      title="Obras"
      subtitle={`${totales.count} obra(s) — Total ${formatEUR(totales.ganado)}`}
      actions={
        <Button onClick={() => navigate({ to: "/admin/obras/nueva" })}>
          <Plus className="mr-1.5 h-4 w-4" /> Nueva obra
        </Button>
      }
    >
      {/* Filtros */}
      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-4 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <Label className="text-xs">Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Cliente, dirección, referencia, teléfono"
              value={filtros.texto} onChange={(e) => setFiltros((f) => ({ ...f, texto: e.target.value }))} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Desde</Label>
          <Input type="date" value={filtros.desde} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} />
        </div>
        <div>
          <Label className="text-xs">Hasta</Label>
          <Input type="date" value={filtros.hasta} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} />
        </div>
        <div>
          <Label className="text-xs">Empleado</Label>
          <Select value={filtros.empleado} onValueChange={(v) => setFiltros((f) => ({ ...f, empleado: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {empleados.map((e) => (
                <SelectItem key={e.user_id} value={e.user_id}>{e.display_name || e.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Estado</Label>
          <Select value={filtros.estado} onValueChange={(v) => setFiltros((f) => ({ ...f, estado: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ESTADOS.map((e) => (<SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end lg:col-span-6">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={filtros.incluirAnulados}
              onChange={(e) => setFiltros((f) => ({ ...f, incluirAnulados: e.target.checked }))} />
            Incluir obras anuladas
          </label>
          <button
            className="ml-auto text-xs text-primary hover:underline"
            onClick={() => setFiltros({ desde: "", hasta: "", empleado: "todos", estado: "todos", texto: "", incluirAnulados: false })}
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Fecha</th>
                <th className="px-3 py-2.5 text-left font-semibold">Ref</th>
                <th className="px-3 py-2.5 text-left font-semibold">Cliente</th>
                <th className="px-3 py-2.5 text-left font-semibold">Dirección</th>
                <th className="px-3 py-2.5 text-left font-semibold">Empleado</th>
                <th className="px-3 py-2.5 text-left font-semibold">Estado</th>
                <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                <th className="px-3 py-2.5 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-16 text-center text-muted-foreground">Sin obras con estos filtros</td></tr>
              ) : filtered.map((o) => (
                <tr key={o.id} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                    <div className="font-medium">{o.fecha}</div>
                    <div className="text-[11px] text-muted-foreground">{o.hora_programada ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{o.referencia ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{o.cliente}</div>
                    {o.telefono_cliente && (
                      <a href={whatsappUrl(o.telefono_cliente)} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary">
                        <MessageCircle className="h-3 w-3" />{o.telefono_cliente}
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <a href={googleMapsUrl(o)} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:text-primary">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="max-w-[220px] truncate">{o.direccion}{o.piso ? `, ${o.piso}` : ""}</span>
                    </a>
                    <div className="text-[11px] text-muted-foreground">{o.codigo_postal ?? ""} {o.ciudad ?? ""}</div>
                  </td>
                  <td className="px-3 py-2.5 text-xs">{empleadoName(o.empleado_id)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-medium ${statusColorClass(o)}`}>
                      {displayStatus(o)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">
                    {formatEUR(jobTotal(o))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <div className="inline-flex gap-1">
                      <Link to="/trabajo/$id" params={{ id: o.id }} title="Ver detalle empleado">
                        <Button size="sm" variant="ghost"><ExternalLink className="h-4 w-4" /></Button>
                      </Link>
                      <Link to="/admin/obras/$id" params={{ id: o.id }}>
                        <Button size="sm" variant="ghost"><Pencil className="h-4 w-4" /></Button>
                      </Link>
                      {!o.eliminado_logico && (
                        <Button size="sm" variant="ghost" onClick={() => setAnular(o)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnularDialog obra={anular} onClose={() => setAnular(null)} onConfirm={confirmarAnulacion} />
    </AdminShell>
  );
}

function AnularDialog({ obra, onClose, onConfirm }: { obra: Job | null; onClose: () => void; onConfirm: (m: string) => void }) {
  const [motivo, setMotivo] = useState("");
  return (
    <Dialog open={!!obra} onOpenChange={(v) => { if (!v) { onClose(); setMotivo(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Anular obra</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            La obra <b>{obra?.referencia}</b> ({obra?.cliente}) quedará marcada como anulada y no contará en ganancias.
          </p>
          <Label>Motivo *</Label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Explica por qué se anula…" rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setMotivo(""); }}>Cancelar</Button>
          <Button variant="destructive" onClick={() => { onConfirm(motivo); setMotivo(""); }}>Anular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
