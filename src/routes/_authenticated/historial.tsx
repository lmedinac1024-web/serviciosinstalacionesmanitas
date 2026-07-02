import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { JobCard } from "@/components/JobCard";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS, type Job, type JobStatus } from "@/lib/jobs";

export const Route = createFileRoute("/_authenticated/historial")({
  component: Historial,
});

type RangeOpt = "todos" | "hoy" | "semana" | "mes";

function startOfWeek() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Historial() {
  const [range, setRange] = useState<RangeOpt>("todos");
  const [estado, setEstado] = useState<string>("todos");
  const [cliente, setCliente] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [tipo, setTipo] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["jobs", "historial"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servicios')
        .select("*")
        .order("fecha", { ascending: false })
        .order("hora_programada", { ascending: false });
      if (error) throw error;
      return data as Job[];
    },
  });

  const filtered = useMemo(() => {
    return data.filter((j) => {
      if (range === "hoy" && j.fecha !== todayStr()) return false;
      if (range === "semana" && new Date(j.fecha) < startOfWeek()) return false;
      if (range === "mes" && new Date(j.fecha) < startOfMonth()) return false;
      if (estado !== "todos" && j.estado !== estado) return false;
      if (cliente && !j.cliente.toLowerCase().includes(cliente.toLowerCase())) return false;
      if (ciudad && !(j.ciudad ?? "").toLowerCase().includes(ciudad.toLowerCase())) return false;
      if (tipo && !(j.tipo_servicio ?? "").toLowerCase().includes(tipo.toLowerCase())) return false;
      return true;
    });
  }, [data, range, estado, cliente, ciudad, tipo]);

  return (
    <AppShell title="Historial">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Select value={range} onValueChange={(v) => setRange(v as RangeOpt)}>
            <SelectTrigger><SelectValue placeholder="Rango" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="hoy">Hoy</SelectItem>
              <SelectItem value="semana">Esta semana</SelectItem>
              <SelectItem value="mes">Este mes</SelectItem>
            </SelectContent>
          </Select>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {(Object.keys(STATUS_LABELS) as JobStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
          <Input placeholder="Ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
          <Input placeholder="Tipo de servicio" value={tipo} onChange={(e) => setTipo(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            No hay resultados con esos filtros.
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">{filtered.length} resultados</div>
            <div className="space-y-2">
              {filtered.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
