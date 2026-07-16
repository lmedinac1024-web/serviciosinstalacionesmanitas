import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Navigation2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { JobCard } from "@/components/JobCard";
import { Button } from "@/components/ui/button";
import type { Job, JobStatus } from "@/lib/jobs";
import { listAll, subscribe as subscribeOffline, type PendingAction } from "@/lib/offline-queue";
import { useNearestSort } from "@/hooks/useNearestSort";

export const Route = createFileRoute("/_authenticated/hoy")({
  component: Hoy,
});

function Hoy() {
  const [queuedActions, setQueuedActions] = useState<PendingAction[]>([]);
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const { data = [], isLoading } = useQuery({
    queryKey: ["jobs", "hoy", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servicios')
        .select("*")
        .eq("eliminado_logico", false)
        .eq("fecha", today)
        .order("hora_programada", { ascending: true });
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

  const effectiveData = useMemo(() => {
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

    return data.map((job) => ({ ...job, ...(patchesByJob.get(job.id) ?? {}) }));
  }, [data, queuedActions]);

  const nearest = useNearestSort();
  const sortedData = useMemo(() => nearest.sortJobs(effectiveData), [nearest, effectiveData]);

  return (
    <AppShell title="Hoy">
      <div className="mb-3 flex justify-end">
        <Button
          size="sm"
          variant={nearest.active ? "default" : "outline"}
          onClick={() => void nearest.toggle()}
          disabled={nearest.loading}
        >
          <Navigation2 className="mr-1.5 h-4 w-4" />
          {nearest.loading ? "Ubicando..." : nearest.active ? "Ordenado por cercanía" : "Ordenar por cercanía"}
        </Button>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando...</div>
      ) : sortedData.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          No hay trabajos para hoy.
        </div>
      ) : (
        <div className="space-y-2">
          {sortedData.map((j) => {
            const d = nearest.distanceFor(j);
            return (
              <div key={j.id} className="space-y-1">
                <JobCard job={j} />
                {nearest.active && (
                  <div className="pl-1 text-xs text-muted-foreground">
                    {d != null ? `📍 ${d < 1000 ? `${d} m` : `${(d / 1000).toFixed(1)} km`} de tu ubicación` : "📍 Sin coordenadas"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

