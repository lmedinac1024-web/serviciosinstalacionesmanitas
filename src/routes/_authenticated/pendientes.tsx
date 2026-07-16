import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { JobCard } from "@/components/JobCard";
import { Button } from "@/components/ui/button";
import { Camera, Navigation2 } from "lucide-react";
import type { Job } from "@/lib/jobs";
import type { JobStatus } from "@/lib/jobs";
import { listAll, subscribe as subscribeOffline, type PendingAction } from "@/lib/offline-queue";
import { useNearestSort, formatRouteLeg } from "@/hooks/useNearestSort";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pendientes")({
  component: Pendientes,
});

type Filtro = "pendientes" | "realizados" | "todos";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "pendientes", label: "Pendientes" },
  { id: "realizados", label: "Realizados" },
  { id: "todos", label: "Todos" },
];

function Pendientes() {
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [queuedActions, setQueuedActions] = useState<PendingAction[]>([]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["jobs", "lista", filtro],
    queryFn: async () => {
      // Traemos todos y filtramos después de aplicar la cola offline. Así, si un
      // empleado finaliza/cancela sin buena conexión, desaparece de Pendientes y
      // aparece en Realizados al instante aunque Supabase siga sincronizando.
      const { data, error } = await supabase
        .from("servicios")
        .select("*")
        .eq("eliminado_logico", false)
        .order("fecha", { ascending: false })
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

  const effectiveAllData = useMemo(() => {
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

  const filteredData = useMemo(
    () => effectiveAllData.filter((job) => {
      if (filtro === "pendientes") return job.estado === "pendiente" || job.estado === "en_proceso";
      if (filtro === "realizados") return job.estado === "realizado" || job.estado.startsWith("cancelado");
      return true;
    }),
    [effectiveAllData, filtro],
  );

  const nearest = useNearestSort(filteredData);
  const route = nearest.route;
  const effectiveData = route.sorted;

  const today = new Date().toISOString().slice(0, 10);
  const isPastOrToday = (fecha: string | null | undefined) => !!fecha && fecha <= today;

  const counts = {
    pendientes: effectiveAllData.filter((j) => j.estado === "pendiente" || j.estado === "en_proceso").length,
    realizados: effectiveAllData.filter((j) => j.estado === "realizado" || j.estado.startsWith("cancelado")).length,
    todos: effectiveAllData.length,
  };

  return (
    <AppShell title="Trabajos">
      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
              filtro === f.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {f.label}
            {filtro === f.id && ` · ${counts[f.id]}`}
          </button>
        ))}
        {nearest.active && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => nearest.setMode(nearest.effectiveMode === "transit" ? "distance" : "transit")}
            disabled={nearest.transitLoading}
            className="ml-auto shrink-0"
          >
            {nearest.effectiveMode === "transit" ? "🚌 Transporte público" : "📍 Distancia"}
          </Button>
        )}
        <Button
          size="sm"
          variant={nearest.active ? "default" : "outline"}
          onClick={() => void nearest.toggle()}
          disabled={nearest.loading || nearest.transitLoading}
          className={cn("shrink-0", !nearest.active && "ml-auto")}
        >
          <Navigation2 className="mr-1.5 h-4 w-4" />
          {nearest.loading
            ? "Ubicando..."
            : nearest.active
              ? nearest.effectiveMode === "transit"
                ? "Ruta: transporte público"
                : "Ruta: distancia"
              : "Ruta lógica"}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando...</div>
      ) : effectiveData.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          {filtro === "pendientes"
            ? "No tienes trabajos pendientes."
            : filtro === "realizados"
            ? "Aún no hay trabajos realizados."
            : "No hay trabajos."}
        </div>
      ) : (
        <div className="space-y-2">
          {effectiveData.map((j: Job, idx: number) => {
            const esPendiente = j.estado === "pendiente" || j.estado === "en_proceso";
            const legInfo = route.legInfo.get(j.id);
            const legLabel = formatRouteLeg(
              legInfo?.durationSeconds,
              legInfo?.distanceMeters ?? route.legs.get(j.id),
              nearest.effectiveMode,
            );
            return (
              <div key={j.id} className="space-y-1.5">
                {nearest.active && (
                  <div className="pl-1 text-xs font-medium text-primary">
                    {`🗺️ Parada ${idx + 1}`}
                    {legLabel ? ` · ${idx === 0 ? "desde tu ubicación" : "desde la anterior"}: ${legLabel}` : " · sin coordenadas"}
                  </div>
                )}
                <JobCard job={j} />
                {esPendiente && isPastOrToday(j.fecha) && (
                  <Button asChild size="sm" className="w-full">
                    <Link to="/trabajo/$id" params={{ id: j.id }}>
                      <Camera className="mr-1.5 h-4 w-4" />
                      Finalizar con foto
                    </Link>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
