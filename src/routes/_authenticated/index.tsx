import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { JobCard } from "@/components/JobCard";
import { formatEUR, jobTotal, type Job } from "@/lib/jobs";
import { useUserRole } from "@/hooks/useUserRole";
import { Trophy, Users, TrendingUp, CheckCircle2, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({ component: Dashboard });

function startOfWeekISO(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Dashboard() {
  const { data: me } = useUserRole();
  const isAdmin = me?.role === "admin";

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from('servicios').select("*")
        .order("fecha", { ascending: false }).order("hora", { ascending: true });
      if (error) throw error;
      return data as Job[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["all-profiles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, username, display_name");
      return data ?? [];
    },
  });

  const today = todayStr();
  const weekStart = startOfWeekISO();
  const monthStart = startOfMonthISO();

  const realizados = jobs.filter((j) => j.estado === "realizado");
  const pendientesHoy = jobs.filter((j) => j.fecha === today && j.estado === "pendiente");
  const realizadosHoy = realizados.filter((j) => j.hora_fin && j.hora_fin.slice(0, 10) === today);
  const canceladosHoy = jobs.filter((j) => j.fecha === today && j.estado.startsWith("cancelado"));
  const enProcesoHoy = jobs.filter((j) => j.fecha === today && j.estado === "en_proceso");

  const sum = (arr: Job[]) => arr.reduce((a, j) => a + jobTotal(j), 0);
  const ganadoHoy = sum(realizadosHoy);
  const ganadoSemana = sum(realizados.filter((j) => j.hora_fin && j.hora_fin >= weekStart));
  const ganadoMes = sum(realizados.filter((j) => j.hora_fin && j.hora_fin >= monthStart));
  const totalAcumulado = sum(realizados);

  const proximos = jobs.filter((j) => j.estado === "pendiente" || j.estado === "en_proceso").slice(0, 5);

  // Ranking empleados (solo admin)
  const nameOf = (uid: string | null) => {
    if (!uid) return "—";
    const p = profiles.find((x) => x.user_id === uid);
    return p?.display_name || p?.username || "—";
  };
  const ranking = isAdmin
    ? Object.entries(
        realizados.reduce<Record<string, { ganado: number; count: number }>>((acc, j) => {
          const key = j.empleado_id ?? j.user_id;
          if (!key) return acc;
          if (!acc[key]) acc[key] = { ganado: 0, count: 0 };
          acc[key].ganado += jobTotal(j);
          acc[key].count += 1;
          return acc;
        }, {}),
      )
        .map(([uid, v]) => ({ uid, name: nameOf(uid), ...v }))
        .sort((a, b) => b.ganado - a.ganado)
    : [];

  return (
    <AppShell title={isAdmin ? "Panel de control" : "Mi panel"}>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando...</div>
      ) : (
        <div className="space-y-6">
          {/* Hero KPIs */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <BigKpi label="Ganado hoy" value={formatEUR(ganadoHoy)} icon={TrendingUp} tone="success" />
            <BigKpi label="Esta semana" value={formatEUR(ganadoSemana)} icon={TrendingUp} />
            <BigKpi label="Este mes" value={formatEUR(ganadoMes)} icon={TrendingUp} />
            <BigKpi label="Acumulado" value={formatEUR(totalAcumulado)} icon={Trophy} tone="primary" />
          </section>

          {/* Estado del día */}
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hoy</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MiniKpi label="Pendientes" value={pendientesHoy.length} icon={Clock} tone="warning" />
              <MiniKpi label="En proceso" value={enProcesoHoy.length} icon={Clock} tone="info" />
              <MiniKpi label="Realizados" value={realizadosHoy.length} icon={CheckCircle2} tone="success" />
              <MiniKpi label="Cancelados" value={canceladosHoy.length} icon={XCircle} tone="destructive" />
            </div>
          </section>

          {/* Ranking empleados (admin) */}
          {isAdmin && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Users className="mr-1 inline h-3.5 w-3.5" /> Ranking empleados
                </h2>
                <Link to="/admin/empleados" className="text-xs font-medium text-primary">Gestionar</Link>
              </div>
              {ranking.length === 0 ? (
                <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
                  Sin trabajos realizados todavía.
                </div>
              ) : (
                <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
                  {ranking.map((r, i) => (
                    <div key={r.uid} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold",
                          i === 0 ? "bg-primary text-primary-foreground" :
                          i === 1 ? "bg-primary/20 text-primary" :
                          "bg-muted text-muted-foreground",
                        )}>
                          {i + 1}
                        </div>
                        <div>
                          <div className="font-semibold">{r.name}</div>
                          <div className="text-xs text-muted-foreground">{r.count} trabajos realizados</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-primary">{formatEUR(r.ganado)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Próximos */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Próximos trabajos</h2>
              <Link to="/pendientes" className="text-xs font-medium text-primary">Ver todos</Link>
            </div>
            {proximos.length === 0 ? (
              <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
                No hay trabajos pendientes.
              </div>
            ) : (
              <div className="space-y-2">
                {proximos.map((j) => <JobCard key={j.id} job={j} />)}
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

function BigKpi({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Trophy; tone?: "success" | "primary" }) {
  return (
    <div className={cn(
      "rounded-xl border p-4 shadow-sm",
      tone === "success" ? "border-success/30 bg-gradient-to-br from-success/10 to-transparent" :
      tone === "primary" ? "border-primary/30 bg-gradient-to-br from-primary/10 to-transparent" :
      "bg-card",
    )}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <Icon className={cn("h-4 w-4", tone === "success" ? "text-success" : tone === "primary" ? "text-primary" : "text-muted-foreground")} />
      </div>
      <div className={cn("mt-2 text-2xl font-bold", tone === "success" ? "text-success" : tone === "primary" ? "text-primary" : "")}>
        {value}
      </div>
    </div>
  );
}

function MiniKpi({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Trophy; tone: "warning" | "info" | "success" | "destructive" }) {
  const toneMap = {
    warning: "text-warning",
    info: "text-info",
    success: "text-success",
    destructive: "text-destructive",
  } as const;
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <Icon className={cn("h-4 w-4", toneMap[tone])} />
      </div>
      <div className={cn("mt-2 text-2xl font-bold", toneMap[tone])}>{value}</div>
    </div>
  );
}
