import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { JobCard } from "@/components/JobCard";
import type { Job } from "@/lib/jobs";

export const Route = createFileRoute("/_authenticated/realizados")({
  component: Realizados,
});

function Realizados() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["jobs", "realizados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("estado", "realizado")
        .order("finalizado_at", { ascending: false });
      if (error) throw error;
      return data as Job[];
    },
  });

  return (
    <AppShell title="Realizados">
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando...</div>
      ) : data.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Aún no has marcado trabajos como realizados.
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
