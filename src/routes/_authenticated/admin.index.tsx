import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/AdminShell";
import { formatEUR, jobTotal, type Job } from "@/lib/jobs";
import {
  Briefcase, Clock, CheckCircle2, XCircle, TrendingUp, Trophy, Users, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/")({ component: AdminDashboard });

type Rango = "hoy" | "semana" | "mes" | "todo";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfWeekISO() {
  const d = new Date(); const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function AdminDashboard() {
  const [rango, setRango] = useState<Rango>("mes");
  const [empleadoSel, setEmpleadoSel] = useState<string>("");

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["admin", "jobs", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servicios").select("*").order("fecha", { ascending: false });
      if (error) throw error;
      return (data as Job[]).filter((j) => !j.eliminado_logico);
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin", "profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, username, display_name").order("display_name");
      return data ?? [];
    },
  });

  const today = todayStr();
  const weekStart = startOfWeekISO();
  const monthStart = startOfMonthISO();

  const matchEmpleado = (j: Job) => {
    if (empleadoSel === "todos") return true;
    const uid = (j.empleado_id ?? j.user_id) as string | null;
    return uid === empleadoSel;
  };
  const hasSelection = empleadoSel !== "";

  const stats = useMemo(() => {
    const base = jobs.filter(matchEmpleado);
    const hoy = base.filter((j) => j.fecha === today);
    const pagados = base.filter((j) => j.estado === "realizado" || j.estado.startsWith("cancelado"));
    const sum = (a: Job[]) => a.reduce((n, j) => n + jobTotal(j), 0);
    return {
      hoy: {
        total: hoy.length,
        pendientes: hoy.filter((j) => j.estado === "pendiente").length,
        en_proceso: hoy.filter((j) => j.estado === "en_proceso").length,
        realizados: hoy.filter((j) => j.estado === "realizado").length,
        cancelados: hoy.filter((j) => j.estado.startsWith("cancelado")).length,
      },
      ganado: {
        hoy: sum(pagados.filter((j) => j.fecha === today)),
        semana: sum(pagados.filter((j) => j.fecha >= weekStart.slice(0, 10))),
        mes: sum(pagados.filter((j) => j.fecha >= monthStart.slice(0, 10))),
        acumulado: sum(pagados),
      },
      pagados,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, today, weekStart, monthStart, empleadoSel]);


  // Rango seleccionado para tabla empleados
  const rangoInicio = rango === "hoy" ? today
    : rango === "semana" ? weekStart.slice(0, 10)
    : rango === "mes" ? monthStart.slice(0, 10)
    : "0000-00-00";

  const ranking = useMemo(() => {
    const nameOf = (uid: string | null) => {
      const p = profiles.find((x) => x.user_id === uid);
      return p?.display_name || p?.username || "—";
    };
    const filtered = stats.pagados.filter((j) => j.fecha >= rangoInicio);
    const map = new Map<string, { name: string; count: number; ganado: number; realizados: number; cancelados: number }>();
    for (const j of filtered) {
      const uid = j.empleado_id ?? j.user_id;
      if (!uid) continue;
      const cur = map.get(uid) ?? { name: nameOf(uid), count: 0, ganado: 0, realizados: 0, cancelados: 0 };
      cur.count += 1;
      cur.ganado += jobTotal(j);
      if (j.estado === "realizado") cur.realizados += 1;
      else cur.cancelados += 1;
      map.set(uid, cur);
    }
    return Array.from(map.entries())
      .map(([uid, v]) => ({ uid, ...v }))
      .sort((a, b) => b.ganado - a.ganado);
  }, [stats.pagados, rangoInicio, profiles]);

  return (
    <AdminShell title="Dashboard" subtitle="Vista general del negocio">
      {isLoading ? (
        <div className="grid place-items-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Filtro por empleado */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Empleado:</span>
            <select
              value={empleadoSel}
              onChange={(e) => setEmpleadoSel(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            >
              <option value="" disabled>Selecciona…</option>
              <option value="todos">Todos</option>
              {profiles.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.display_name || p.username || p.user_id.slice(0, 6)}
                </option>
              ))}
            </select>
            {hasSelection && (
              <button
                type="button"
                onClick={() => setEmpleadoSel("")}
                className="text-xs text-primary hover:underline"
              >
                limpiar
              </button>
            )}
          </div>

          {!hasSelection ? (
            <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
              Selecciona un empleado (o «Todos») para ver la información del dashboard.
            </div>
          ) : (
          <>


          {/* KPIs ganancias */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ganancias{empleadoSel !== "todos" ? ` · ${profiles.find((p) => p.user_id === empleadoSel)?.display_name ?? ""}` : ""}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Hoy" value={formatEUR(stats.ganado.hoy)} icon={TrendingUp} tone="success" />

              <KpiCard label="Esta semana" value={formatEUR(stats.ganado.semana)} icon={TrendingUp} />
              <KpiCard label="Este mes" value={formatEUR(stats.ganado.mes)} icon={TrendingUp} />
              <KpiCard label="Acumulado" value={formatEUR(stats.ganado.acumulado)} icon={Trophy} tone="primary" />
            </div>
          </section>

          {/* Obras de hoy */}
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Obras de hoy</h2>
              <Link to="/admin/obras" className="text-xs font-medium text-primary hover:underline">Ver todas →</Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <KpiCard label="Total hoy" value={stats.hoy.total} icon={Briefcase} />
              <KpiCard label="Pendientes" value={stats.hoy.pendientes} icon={Clock} tone="warning" />
              <KpiCard label="En proceso" value={stats.hoy.en_proceso} icon={Clock} tone="info" />
              <KpiCard label="Realizadas" value={stats.hoy.realizados} icon={CheckCircle2} tone="success" />
              <KpiCard label="Canceladas" value={stats.hoy.cancelados} icon={XCircle} tone="destructive" />
            </div>
          </section>

          {/* Ranking empleados */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Total por empleado
              </h2>
              <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
                {(["hoy", "semana", "mes", "todo"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRango(r)}
                    className={cn(
                      "rounded px-2.5 py-1 font-medium capitalize",
                      rango === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r === "todo" ? "Todo" : r}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Empleado</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Obras</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Realizadas</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Canceladas</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Ganado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ranking.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Sin datos en este periodo</td></tr>
                  ) : ranking.map((r) => (
                    <tr key={r.uid} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.count}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-success">{r.realizados}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-destructive">{r.cancelados}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatEUR(r.ganado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          </>
          )}
        </div>

      )}
    </AdminShell>
  );
}

function KpiCard({
  label, value, icon: Icon, tone,
}: {
  label: string; value: string | number;
  icon: typeof TrendingUp;
  tone?: "success" | "warning" | "info" | "destructive" | "primary";
}) {
  const toneCls = tone === "success" ? "text-success bg-success/10"
    : tone === "warning" ? "text-warning bg-warning/10"
    : tone === "info" ? "text-info bg-info/10"
    : tone === "destructive" ? "text-destructive bg-destructive/10"
    : tone === "primary" ? "text-primary bg-primary/10"
    : "text-foreground bg-muted";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums">{value}</div>
        </div>
        <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-md", toneCls)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
