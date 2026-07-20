import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { JobCard } from "@/components/JobCard";
import { useUserRole } from "@/hooks/useUserRole";
import type { Job } from "@/lib/jobs";

export const Route = createFileRoute("/_authenticated/realizados")({
  component: Realizados,
  errorComponent: RealizadosError,
});

function RealizadosError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <AppShell title="Realizados">
      <div className="rounded-lg border bg-card p-6 text-center text-sm">
        <div className="font-semibold text-destructive">No se pudo cargar realizados</div>
        <div className="mt-1 text-muted-foreground">{error?.message || "Error desconocido"}</div>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Reintentar
        </button>
      </div>
    </AppShell>
  );
}

function Realizados() {
  const { data: me } = useUserRole();
  const [empleadoSel, setEmpleadoSel] = useState<string>("todos");

  const { data: empleados = [] } = useQuery({
    queryKey: ["empleados-basico"],
    enabled: !!me?.isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, username, display_name").order("display_name");
      return data ?? [];
    },
  });

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["jobs", "realizados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servicios")
        .select("*")
        .eq("estado", "realizado")
        .order("fecha", { ascending: false })
        .order("hora_fin", { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Job[];
    },
    retry: 1,
  });

  const filtered = useMemo(() => {
    const base = data.filter((j) => !j.eliminado_logico);
    if (!me?.isAdmin || empleadoSel === "todos") return base;
    return base.filter((j) => (j.empleado_id ?? j.user_id) === empleadoSel);
  }, [data, me?.isAdmin, empleadoSel]);

  return (
    <AppShell title="Realizados">
      {me?.isAdmin && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Empleado:</span>
          <select
            value={empleadoSel}
            onChange={(e) => setEmpleadoSel(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value="todos">Todos</option>
            {empleados.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.display_name || p.username || p.user_id.slice(0, 6)}
              </option>
            ))}
          </select>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando...</div>
      ) : error ? (
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Aún no hay trabajos realizados.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
