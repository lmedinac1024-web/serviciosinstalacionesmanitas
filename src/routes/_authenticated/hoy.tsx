import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Navigation2, List, Map as MapIcon } from "lucide-react";
const JobsMap = lazy(() => import("@/components/JobsMap"));
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { JobCard } from "@/components/JobCard";
import { Button } from "@/components/ui/button";
import type { Job, JobStatus } from "@/lib/jobs";
import { listAll, subscribe as subscribeOffline, type PendingAction } from "@/lib/offline-queue";
import { useNearestSort, formatRouteLeg } from "@/hooks/useNearestSort";

export const Route = createFileRoute("/_authenticated/hoy")({
  component: Hoy,
});

function Hoy() {
  const [queuedActions, setQueuedActions] = useState<PendingAction[]>([]);
  const [vista, setVista] = useState<"lista" | "mapa">("lista");
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

  const nearest = useNearestSort(effectiveData);
  const route = nearest.route;

  const routeButtonLabel = nearest.loading
    ? "Ubicando..."
    : nearest.active
      ? nearest.effectiveMode === "transit"
        ? "Ruta lógica: transporte público"
        : "Ruta lógica: distancia"
      : "Ordenar por ruta lógica";

  return (
    <AppShell title="Hoy">
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border bg-card p-1">
        <Button size="sm" variant={vista === "lista" ? "default" : "ghost"} onClick={() => setVista("lista")}>
          <List className="mr-1.5 h-4 w-4" /> Lista
        </Button>
        <Button size="sm" variant={vista === "mapa" ? "default" : "ghost"} onClick={() => setVista("mapa")}>
          <MapIcon className="mr-1.5 h-4 w-4" /> Mapa
        </Button>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {nearest.active && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => nearest.setMode(nearest.effectiveMode === "transit" ? "distance" : "transit")}
            disabled={nearest.transitLoading}
          >
            {nearest.effectiveMode === "transit" ? "🚌 Transporte público" : "📍 Distancia"}
          </Button>
        )}
        <Button
          size="sm"
          variant={nearest.active ? "default" : "outline"}
          onClick={() => void nearest.toggle()}
          disabled={nearest.loading || nearest.transitLoading}
        >
          <Navigation2 className="mr-1.5 h-4 w-4" />
          {routeButtonLabel}
        </Button>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando...</div>
      ) : route.sorted.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          No hay trabajos para hoy.
        </div>
      ) : vista === "mapa" ? (
        <ClientOnly fallback={<div className="text-sm text-muted-foreground">Cargando mapa...</div>}>
          <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando mapa...</div>}>
            <JobsMap jobs={route.sorted} />
          </Suspense>
        </ClientOnly>
      ) : (
        <div className="space-y-2">
          {route.sorted.map((j: Job, idx: number) => {
            const legInfo = route.legInfo.get(j.id);
            const legLabel = formatRouteLeg(
              legInfo?.durationSeconds,
              legInfo?.distanceMeters ?? route.legs.get(j.id),
              nearest.effectiveMode,
            );
            return (
              <div key={j.id} className="space-y-1">
                {nearest.active && (
                  <div className="pl-1 text-xs font-medium text-primary">
                    {`🗺️ Parada ${idx + 1}`}
                    {legLabel ? ` · ${idx === 0 ? "desde tu ubicación" : "desde la anterior"}: ${legLabel}` : " · sin coordenadas"}
                  </div>
                )}
                <JobCard job={j} />
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );

}

