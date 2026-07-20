import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { formatEUR, jobTotal, isPaid, type Job, type JobStatus } from "@/lib/jobs";
import { StatusBadge } from "@/components/StatusBadge";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { listAll, subscribe as subscribeOffline, type PendingAction } from "@/lib/offline-queue";
import { useUserRole } from "@/hooks/useUserRole";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/ganancias")({
  component: Ganancias,
});


function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function startOfWeek(d: Date) {
  const c = new Date(d);
  const day = (c.getDay() + 6) % 7;
  c.setDate(c.getDate() - day);
  c.setHours(0, 0, 0, 0);
  return c;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

type Rango = "dia" | "semana" | "mes" | "custom";

function Ganancias() {
  const { data: me } = useUserRole();
  const [empleadoFiltro, setEmpleadoFiltro] = useState<string>("todos");
  const [queuedActions, setQueuedActions] = useState<PendingAction[]>([]);
  const { data: empleados = [] } = useQuery({
    queryKey: ["profiles", "empleados-list"],
    enabled: !!me?.canManage,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, username, display_name").order("display_name");
      return data ?? [];
    },
  });

  const { data: allJobs = [], isLoading } = useQuery({
    queryKey: ["jobs", "pagables"],
    queryFn: async () => {
      // Traer todos para poder aplicar encima los estados que estén en cola offline.
      const { data, error } = await supabase
        .from("servicios")
        .select("*")
        .eq("eliminado_logico", false)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data as Job[];
    },
  });

  useEffect(() => {
    let alive = true;
    const loadQueued = async () => {
      const queued = await listAll();
      if (alive) setQueuedActions(queued);
    };
    void loadQueued();
    const unsubscribe = subscribeOffline(() => { void loadQueued(); });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const effectiveJobs = useMemo(() => {
    const patchesByJob = new Map<string, Partial<Job>>();
    queuedActions
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((action) => {
        const at = new Date(action.createdAt).toISOString();
        const patch: Partial<Job> =
          action.kind === "inicio"
            ? { estado: "en_proceso", hora_llegada: at }
            : action.kind === "final"
              ? { estado: "realizado", hora_fin: at }
              : {
                  estado: ((action.motivo ?? "cancelado_otro|Cancelado").split("|")[0] || "cancelado_otro") as JobStatus,
                  hora_fin: at,
                  motivo_cancelacion: (action.motivo ?? "cancelado_otro|Cancelado").split("|").slice(1).join("|") || "Cancelado",
                };
        patchesByJob.set(action.jobId, { ...(patchesByJob.get(action.jobId) ?? {}), ...patch });
      });

    return allJobs.map((job) => ({ ...job, ...(patchesByJob.get(job.id) ?? {}) }));
  }, [allJobs, queuedActions]);

  // Solo servicios que "pagan": realizado o cancelado, no en curso.
  const jobs = useMemo(() => effectiveJobs.filter(isPaid), [effectiveJobs]);

  const [rango, setRango] = useState<Rango>("dia");
  const [dia, setDia] = useState<string>(toISODate(new Date()));
  const [desde, setDesde] = useState<string>(toISODate(startOfMonth(new Date())));
  const [hasta, setHasta] = useState<string>(toISODate(endOfMonth(new Date())));

  // Rango efectivo en formato YYYY-MM-DD
  const { from, to } = useMemo(() => {
    if (rango === "dia") return { from: dia, to: dia };
    if (rango === "semana") {
      const base = new Date(dia + "T00:00:00");
      const start = startOfWeek(base);
      const end = addDays(start, 6);
      return { from: toISODate(start), to: toISODate(end) };
    }
    if (rango === "mes") {
      const base = new Date(dia + "T00:00:00");
      return { from: toISODate(startOfMonth(base)), to: toISODate(endOfMonth(base)) };
    }
    return { from: desde, to: hasta };
  }, [rango, dia, desde, hasta]);

  function fechaOf(j: Job): string {
    return j.fecha;
  }

  const filtrados = useMemo(
    () => jobs.filter((j) => {
      const f = fechaOf(j);
      if (f < from || f > to) return false;
      if (me?.canManage && empleadoFiltro !== "todos") {
        const uid = (j.empleado_id ?? j.user_id) as string | null | undefined;
        if (uid !== empleadoFiltro) return false;
      }
      return true;
    }),
    [jobs, from, to, me, empleadoFiltro],
  );

  const totalRango = filtrados.reduce((a, j) => a + jobTotal(j), 0);

  // Desglose día a día del rango
  const porDia = useMemo(() => {
    const map = new Map<string, { ganado: number; count: number }>();
    for (const j of filtrados) {
      const f = fechaOf(j);
      const entry = map.get(f) ?? { ganado: 0, count: 0 };
      entry.ganado += jobTotal(j);
      entry.count += 1;
      map.set(f, entry);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtrados]);

  const hoy = toISODate(new Date());
  const ganadoHoy = useMemo(() => {
    return jobs.filter((j) => {
      if (fechaOf(j) !== hoy) return false;
      if (me?.canManage && empleadoFiltro !== "todos") {
        const uid = (j.empleado_id ?? j.user_id) as string | null | undefined;
        if (uid !== empleadoFiltro) return false;
      }
      return true;
    }).reduce((a, j) => a + jobTotal(j), 0);
  }, [jobs, hoy, me, empleadoFiltro]);


  return (
    <AppShell title="Ganancias">
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando...</div>
      ) : (
        <div className="space-y-5">
          {me?.canManage && (
            <div className="rounded-xl border bg-card p-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Filtrar por empleado
              </div>
              <Select value={empleadoFiltro} onValueChange={setEmpleadoFiltro}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los empleados</SelectItem>
                  {empleados.map((e) => (
                    <SelectItem key={e.user_id} value={e.user_id}>
                      {e.display_name || e.username || e.user_id.slice(0, 6)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {/* Ganado hoy siempre visible */}
          <div className="rounded-xl border-2 border-success/30 bg-gradient-to-br from-success/10 to-transparent p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ganado hoy{me?.canManage && empleadoFiltro !== "todos" ? ` · ${empleados.find((e) => e.user_id === empleadoFiltro)?.display_name ?? ""}` : ""}
            </div>
            <div className="mt-1 text-3xl font-bold text-success">{formatEUR(ganadoHoy)}</div>
          </div>


          {/* Selector de rango */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {(["dia", "semana", "mes", "custom"] as Rango[]).map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={rango === r ? "default" : "outline"}
                  onClick={() => setRango(r)}
                >
                  {r === "dia" ? "Día" : r === "semana" ? "Semana" : r === "mes" ? "Mes" : "Personalizado"}
                </Button>
              ))}
            </div>

            {rango !== "custom" ? (
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline"
                  onClick={() => setDia(toISODate(addDays(new Date(dia + "T00:00:00"), rango === "mes" ? -30 : rango === "semana" ? -7 : -1)))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <input
                  type="date"
                  value={dia}
                  onChange={(e) => setDia(e.target.value)}
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                />
                <Button size="icon" variant="outline"
                  onClick={() => setDia(toISODate(addDays(new Date(dia + "T00:00:00"), rango === "mes" ? 30 : rango === "semana" ? 7 : 1)))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDia(toISODate(new Date()))}>Hoy</Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Desde</label>
                  <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Hasta</label>
                  <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Rango: <b>{from}</b> → <b>{to}</b>
            </div>
          </div>

          {/* Total del rango */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-card p-4">
              <div className="text-[11px] uppercase text-muted-foreground">Total del rango</div>
              <div className="mt-1 text-2xl font-bold text-primary">{formatEUR(totalRango)}</div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="text-[11px] uppercase text-muted-foreground">Trabajos pagados</div>
              <div className="mt-1 text-2xl font-bold">{filtrados.length}</div>
            </div>
          </div>

          {/* Desglose por día */}
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Desglose diario
            </h2>
            <div className="overflow-hidden rounded-xl border bg-card">
              {porDia.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Sin trabajos en este rango.
                </div>
              ) : (
                <div className="divide-y">
                  {porDia.map(([fecha, v]) => (
                    <div key={fecha} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <div className="font-medium">{fecha}</div>
                        <div className="text-xs text-muted-foreground">{v.count} trabajo{v.count === 1 ? "" : "s"}</div>
                      </div>
                      <div className="text-lg font-bold text-primary">{formatEUR(v.ganado)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Detalle */}
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Detalle de trabajos
            </h2>
            <div className="overflow-hidden rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">Estado</th>
                    <th className="px-3 py-2 text-right">Importe</th>
                    <th className="px-3 py-2 text-right">Llegada</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((j) => (
                    <tr key={j.id} className={cn("border-t", j.estado.startsWith("cancelado") && "bg-destructive/5")}>
                      <td className="px-3 py-2 text-muted-foreground">{fechaOf(j)}</td>
                      <td className="px-3 py-2">{j.cliente}</td>
                      <td className="px-3 py-2"><StatusBadge status={j.estado} /></td>
                      <td className="px-3 py-2 text-right">{formatEUR(j.importe)}</td>
                      <td className="px-3 py-2 text-right">{formatEUR(j.precio_llegada)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatEUR(jobTotal(j))}</td>
                    </tr>
                  ))}
                  {filtrados.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                        Sin trabajos en el rango seleccionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
