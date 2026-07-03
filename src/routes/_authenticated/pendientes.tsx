import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { JobCard } from "@/components/JobCard";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import type { Job } from "@/lib/jobs";
import type { JobStatus } from "@/lib/jobs";
import { listAll, subscribe as subscribeOffline, type PendingAction } from "@/lib/offline-queue";
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
  const qc = useQueryClient();
  const { data: me } = useUserRole();
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const today = new Date().toISOString().slice(0, 10);
  const isPastOrToday = (fecha: string | null | undefined) => !!fecha && fecha <= today;

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

  const effectiveData = useMemo(
    () => effectiveAllData.filter((job) => {
      if (filtro === "pendientes") return job.estado === "pendiente" || job.estado === "en_proceso";
      if (filtro === "realizados") return job.estado === "realizado" || job.estado.startsWith("cancelado");
      return true;
    }),
    [effectiveAllData, filtro],
  );

  async function marcarRealizadoSinFoto(job: Job) {
    if (!confirm(`¿Marcar como realizado el servicio de ${job.cliente} (${job.fecha}) sin foto?`)) return;
    setBusyId(job.id);
    try {
      const { error } = await supabase
        .from("servicios")
        .update({
          estado: "realizado",
          direccion_validada_llegada: true,
          hora_llegada: job.hora_llegada ?? new Date().toISOString(),
          hora_fin: new Date().toISOString(),
        })
        .eq("id", job.id);
      if (error) throw error;
      toast.success("Servicio marcado como realizado");
      qc.invalidateQueries({ queryKey: ["jobs"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setBusyId(null);
    }
  }

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
      </div>

      {me?.isAdmin && filtro !== "realizados" && (
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
          <span className="font-semibold text-primary">Modo admin:</span> puedes marcar servicios de hoy o días anteriores como <b>realizados sin foto</b>.
        </div>
      )}

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
          {effectiveData.map((j) => {
            const esPendiente = j.estado === "pendiente" || j.estado === "en_proceso";
            return (
              <div key={j.id} className="space-y-1.5">
                <JobCard job={j} />
                {me?.isAdmin && esPendiente && isPastOrToday(j.fecha) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => marcarRealizadoSinFoto(j)}
                    disabled={busyId === j.id}
                    className="w-full border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    {busyId === j.id ? "Guardando..." : "Marcar realizado sin foto (admin)"}
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
