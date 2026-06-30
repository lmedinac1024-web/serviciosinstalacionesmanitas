import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { JobCard } from "@/components/JobCard";
import { formatEUR, jobTotal, type Job } from "@/lib/jobs";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function startOfWeekISO(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // monday=0
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
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .order("fecha", { ascending: false })
        .order("hora", { ascending: true });
      if (error) throw error;
      return data as Job[];
    },
  });

  const today = todayStr();
  const weekStart = startOfWeekISO();
  const monthStart = startOfMonthISO();

  const pendientesHoy = jobs.filter((j) => j.fecha === today && j.estado === "pendiente");
  const realizadosHoy = jobs.filter(
    (j) => j.estado === "realizado" && j.finalizado_at && j.finalizado_at.slice(0, 10) === today,
  );
  const canceladosHoy = jobs.filter(
    (j) => j.fecha === today && j.estado.startsWith("cancelado"),
  );

  const sum = (arr: Job[]) => arr.reduce((acc, j) => acc + jobTotal(j), 0);
  const ganadoHoy = sum(realizadosHoy);
  const ganadoSemana = sum(
    jobs.filter(
      (j) => j.estado === "realizado" && j.finalizado_at && j.finalizado_at >= weekStart,
    ),
  );
  const ganadoMes = sum(
    jobs.filter(
      (j) => j.estado === "realizado" && j.finalizado_at && j.finalizado_at >= monthStart,
    ),
  );
  const totalAcumulado = sum(jobs.filter((j) => j.estado === "realizado"));
  const totalRealizados = jobs.filter((j) => j.estado === "realizado").length;
  const totalPendientes = jobs.filter((j) => j.estado === "pendiente").length;

  const proximos = jobs
    .filter((j) => j.estado === "pendiente" || j.estado === "en_proceso")
    .slice(0, 5);

  return (
    <AppShell title="Panel">
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando...</div>
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Ganado hoy" value={formatEUR(ganadoHoy)} accent="success" />
            <Kpi label="Esta semana" value={formatEUR(ganadoSemana)} />
            <Kpi label="Este mes" value={formatEUR(ganadoMes)} />
            <Kpi label="Total acumulado" value={formatEUR(totalAcumulado)} accent="primary" />
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi label="Pendientes hoy" value={String(pendientesHoy.length)} accent="warning" />
            <Kpi label="Realizados hoy" value={String(realizadosHoy.length)} accent="success" />
            <Kpi label="Cancelados hoy" value={String(canceladosHoy.length)} accent="destructive" />
            <Kpi label="Total realizados" value={String(totalRealizados)} />
            <Kpi label="Total pendientes" value={String(totalPendientes)} />
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Próximos
              </h2>
              <Link to="/pendientes" className="text-sm font-medium text-primary">
                Ver todos
              </Link>
            </div>
            {proximos.length === 0 ? (
              <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
                No hay trabajos pendientes. ¡Buen trabajo!
              </div>
            ) : (
              <div className="space-y-2">
                {proximos.map((j) => (
                  <JobCard key={j.id} job={j} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "primary" | "success" | "warning" | "destructive";
}) {
  const accentClass =
    accent === "primary"
      ? "text-primary"
      : accent === "success"
        ? "text-success"
        : accent === "warning"
          ? "text-warning"
          : accent === "destructive"
            ? "text-destructive"
            : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold ${accentClass}`}>{value}</div>
    </div>
  );
}
