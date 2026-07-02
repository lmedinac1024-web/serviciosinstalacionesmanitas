import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { JobCard } from "@/components/JobCard";
import type { Job } from "@/lib/jobs";

export const Route = createFileRoute("/_authenticated/cancelados")({
  component: Cancelados,
});

function Cancelados() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["jobs", "cancelados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servicios')
        .select("*")
        .in("estado", [
          "cancelado_cliente",
          "cancelado_no_estaba",
          "cancelado_direccion",
          "cancelado_otro",
        ])
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data as Job[];
    },
  });

  return (
    <AppShell title="Cancelados">
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando...</div>
      ) : data.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          No hay cancelaciones registradas.
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
