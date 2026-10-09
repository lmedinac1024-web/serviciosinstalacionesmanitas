import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { JobCard } from "@/components/JobCard";
import { Button } from "@/components/ui/button";
import { Camera, List, Map as MapIcon } from "lucide-react";
import type { Job } from "@/lib/jobs";
import type { JobStatus } from "@/lib/jobs";
import { listAll, subscribe as subscribeOffline, type PendingAction } from "@/lib/offline-queue";

const JobsMap = lazy(() => import("@/components/JobsMap"));

export const Route = createFileRoute("/_authenticated/pendientes")({
  component: Pendientes,
  head: () => ({ meta: [
    { title: "Trabajos pendientes | ServiHogar" },
    { name: "description", content: "Servicios pendientes de ServiHogar en lista y mapa, con los datos de cada asegurado." },
    { property: "og:title", content: "Trabajos pendientes | ServiHogar" },
    { property: "og:description", content: "Consulta las ubicaciones y los datos de tus servicios pendientes." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

type Filtro = "pendientes" | "realizados" | "todos";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "pendientes", label: "Pendientes" },
  { id: "realizados", label: "Realizados" },
  { id: "todos", label: "Todos" },
];

function Pendientes() {
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [vista, setVista] = useState<"lista" | "mapa">("lista");
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

  // El pago es mes a mes: los pendientes de meses anteriores se descartan
  // automáticamente (siguen en la base de datos, pero no se listan).
  const inicioMes = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, []);

  const filteredData = useMemo(
    () => effectiveAllData.filter((job) => {
      // Todo el listado es mes a mes: solo trabajos del mes en curso.
      if (job.fecha && job.fecha < inicioMes) return false;
      const esPendiente = job.estado === "pendiente" || job.estado === "en_proceso";
      if (filtro === "pendientes") return esPendiente;
      if (filtro === "realizados") return job.estado === "realizado" || job.estado.startsWith("cancelado");
      return true;
    }),
    [effectiveAllData, filtro, inicioMes],
  );

  const effectiveData = filteredData;
  // El mapa siempre muestra todos los servicios abiertos, no solo los de hoy
  // ni los de la pestaña activa. La cola offline se aplica antes de filtrar.
  const mapJobs = useMemo(() => effectiveAllData.filter((job) =>
    !job.eliminado_logico && !(job.fecha && job.fecha < inicioMes) &&
    (job.estado === "pendiente" || job.estado === "en_proceso")
  ), [effectiveAllData, inicioMes]);

  const today = new Date().toISOString().slice(0, 10);
  const isPastOrToday = (fecha: string | null | undefined) => !!fecha && fecha <= today;

  const delMes = effectiveAllData.filter((j) => !(j.fecha && j.fecha < inicioMes));
  const counts = {
    pendientes: delMes.filter((j) => j.estado === "pendiente" || j.estado === "en_proceso").length,
    realizados: delMes.filter((j) => j.estado === "realizado" || j.estado.startsWith("cancelado")).length,
    todos: delMes.length,
  };


  return (
    <AppShell title="Trabajos">
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border bg-card p-1">
        <Button size="sm" variant={vista === "lista" ? "default" : "ghost"} aria-pressed={vista === "lista"} onClick={() => setVista("lista")}>
          <List className="mr-1.5 h-4 w-4" /> Lista
        </Button>
        <Button size="sm" variant={vista === "mapa" ? "default" : "ghost"} aria-pressed={vista === "mapa"} onClick={() => setVista("mapa")}>
          <MapIcon className="mr-1.5 h-4 w-4" /> Mapa
        </Button>
      </div>
      {vista === "lista" && <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {FILTROS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filtro === f.id ? "default" : "outline"}
            aria-pressed={filtro === f.id}
            onClick={() => setFiltro(f.id)}
            className="shrink-0"
          >
            {f.label}
            {filtro === f.id && ` · ${counts[f.id]}`}
          </Button>
        ))}
      </div>}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando...</div>
      ) : vista === "mapa" ? (
        mapJobs.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No tienes trabajos pendientes.</div>
        ) : (
          <ClientOnly fallback={<div className="text-sm text-muted-foreground">Cargando mapa...</div>}>
            <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando mapa...</div>}>
              <JobsMap jobs={mapJobs} />
            </Suspense>
          </ClientOnly>
        )
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
          {effectiveData.map((j: Job) => {
            const esPendiente = j.estado === "pendiente" || j.estado === "en_proceso";
            return (
              <div key={j.id} className="space-y-1.5">
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
