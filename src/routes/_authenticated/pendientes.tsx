import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { JobCard } from "@/components/JobCard";
import type { Job } from "@/lib/jobs";

export const Route = createFileRoute("/_authenticated/pendientes")({
  component: Pendientes,
});

function Pendientes() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["jobs", "pendientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .in("estado", ["pendiente", "en_proceso"])
        .order("fecha", { ascending: true })
        .order("hora", { ascending: true });
      if (error) throw error;
      return data as Job[];
    },
  });

  return (
    <AppShell title="Pendientes">
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando...</div>
      ) : data.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          No tienes trabajos pendientes.
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
