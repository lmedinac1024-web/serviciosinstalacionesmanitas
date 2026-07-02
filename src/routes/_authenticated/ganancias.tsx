import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { formatEUR, jobTotal, type Job } from "@/lib/jobs";

export const Route = createFileRoute("/_authenticated/ganancias")({
  component: Ganancias,
});

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Ganancias() {
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs", "realizados", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servicios')
        .select("*")
        .eq("estado", "realizado")
        .order("hora_fin", { ascending: false });
      if (error) throw error;
      return data as Job[];
    },
  });

  const today = todayStr();
  const weekStart = (() => {
    const d = new Date();
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();
  const monthStart = (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  })();

  const sum = (arr: Job[]) => arr.reduce((a, j) => a + jobTotal(j), 0);

  const hoy = jobs.filter((j) => j.hora_fin?.slice(0, 10) === today);
  const semana = jobs.filter((j) => j.hora_fin && j.hora_fin >= weekStart);
  const mes = jobs.filter((j) => j.hora_fin && j.hora_fin >= monthStart);

  return (
    <AppShell title="Ganancias">
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando...</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Box label="Hoy" amount={formatEUR(sum(hoy))} count={hoy.length} />
            <Box label="Esta semana" amount={formatEUR(sum(semana))} count={semana.length} />
            <Box label="Este mes" amount={formatEUR(sum(mes))} count={mes.length} />
            <Box label="Total" amount={formatEUR(sum(jobs))} count={jobs.length} accent />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Últimos trabajos cobrados
            </h2>
            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-right">Importe</th>
                    <th className="px-3 py-2 text-right">Llegada</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.slice(0, 30).map((j) => (
                    <tr key={j.id} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">
                        {j.hora_fin?.slice(0, 10) ?? j.fecha}
                      </td>
                      <td className="px-3 py-2">{j.cliente}</td>
                      <td className="px-3 py-2 text-right">{formatEUR(j.importe)}</td>
                      <td className="px-3 py-2 text-right">{formatEUR(j.precio_llegada)}</td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {formatEUR(jobTotal(j))}
                      </td>
                    </tr>
                  ))}
                  {jobs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                        Sin trabajos cobrados aún.
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

function Box({
  label,
  amount,
  count,
  accent,
}: {
  label: string;
  amount: string;
  count: number;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? "bg-primary text-primary-foreground" : "bg-card"}`}>
      <div className={`text-xs font-medium uppercase tracking-wide ${accent ? "opacity-80" : "text-muted-foreground"}`}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{amount}</div>
      <div className={`text-xs ${accent ? "opacity-80" : "text-muted-foreground"}`}>
        {count} trabajo{count === 1 ? "" : "s"}
      </div>
    </div>
  );
}
