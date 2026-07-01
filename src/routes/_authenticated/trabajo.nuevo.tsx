import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";

export const Route = createFileRoute("/_authenticated/trabajo/nuevo")({ component: NuevoTrabajo });

type Cliente = { id: string; nombre: string; direccion: string; piso: string | null; puerta: string | null; codigo_postal: string | null; ciudad: string | null; telefono: string | null; };
type Servicio = { id: string; nombre: string };
type Empleado = { user_id: string; username: string; display_name: string | null };
type Tarifa = { empleado_id: string; servicio_id: string; precio: number };

function NuevoTrabajo() {
  const { data: me, isLoading } = useUserRole();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    hora: "",
    cliente_id: "",
    servicio_id: "",
    empleado_id: "",
    importe: "",
    cantidad: "1",
    observaciones: "",
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => (await supabase.from("clientes").select("*").order("nombre")).data as Cliente[] ?? [],
  });
  const { data: servicios = [] } = useQuery({
    queryKey: ["servicios"],
    queryFn: async () => (await supabase.from("servicios").select("id,nombre").eq("activo", true).order("nombre")).data as Servicio[] ?? [],
  });
  const { data: empleados = [] } = useQuery({
    queryKey: ["empleados-list"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "empleado");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data } = await supabase.from("profiles").select("user_id, username, display_name").in("user_id", ids);
      return (data ?? []) as Empleado[];
    },
  });
  const { data: tarifas = [] } = useQuery({
    queryKey: ["tarifas-all"],
    queryFn: async () => (await supabase.from("tarifas_empleado").select("empleado_id, servicio_id, precio")).data as Tarifa[] ?? [],
  });

  // Autofill importe cuando cambian empleado+servicio
  const tarifaAuto = useMemo(() => {
    if (!form.empleado_id || !form.servicio_id) return null;
    return tarifas.find((t) => t.empleado_id === form.empleado_id && t.servicio_id === form.servicio_id)?.precio ?? null;
  }, [tarifas, form.empleado_id, form.servicio_id]);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => {
      const nf = { ...f, [k]: v };
      if ((k === "empleado_id" || k === "servicio_id") && nf.empleado_id && nf.servicio_id) {
        const t = tarifas.find((x) => x.empleado_id === nf.empleado_id && x.servicio_id === nf.servicio_id);
        if (t) nf.importe = String(t.precio);
      }
      return nf;
    });
  }

  if (isLoading) return <AppShell title="Nuevo trabajo"><div>…</div></AppShell>;
  if (me?.role !== "admin") return <Navigate to="/" />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.cliente_id || !form.empleado_id) return toast.error("Cliente y empleado obligatorios");
    setSaving(true);
    try {
      const cli = clientes.find((c) => c.id === form.cliente_id);
      if (!cli) throw new Error("Cliente no encontrado");
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("jobs").insert({
        user_id: form.empleado_id,
        empleado_id: form.empleado_id,
        assigned_by: userData.user?.id ?? null,
        cliente_id: form.cliente_id,
        servicio_id: form.servicio_id || null,
        cliente: cli.nombre,
        direccion: cli.direccion,
        piso: cli.piso,
        puerta: cli.puerta,
        codigo_postal: cli.codigo_postal,
        ciudad: cli.ciudad,
        telefono: cli.telefono,
        servicio: servicios.find((s) => s.id === form.servicio_id)?.nombre ?? null,
        fecha: form.fecha,
        hora: form.hora || null,
        importe: Number(form.importe) || 0,
        cantidad: Math.max(1, Number(form.cantidad) || 1),
        observaciones: form.observaciones.trim() || null,
      }).select().single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Trabajo creado");
      navigate({ to: "/trabajo/$id", params: { id: data.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Nuevo trabajo">
      <form onSubmit={submit} className="mx-auto max-w-2xl space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha"><Input type="date" required value={form.fecha} onChange={(e) => set("fecha", e.target.value)} /></Field>
          <Field label="Hora"><Input type="time" value={form.hora} onChange={(e) => set("hora", e.target.value)} /></Field>
        </div>

        <Field label="Cliente *">
          {clientes.length === 0 ? (
            <div className="rounded border bg-muted/40 p-3 text-sm text-muted-foreground">
              No hay clientes. Créalos primero en "Clientes".
            </div>
          ) : (
            <Select value={form.cliente_id} onValueChange={(v) => set("cliente_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre} · {c.direccion}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label="Empleado *">
          {empleados.length === 0 ? (
            <div className="rounded border bg-muted/40 p-3 text-sm text-muted-foreground">
              No hay empleados. Créalos en "Empleados".
            </div>
          ) : (
            <Select value={form.empleado_id} onValueChange={(v) => set("empleado_id", v)}>
              <SelectTrigger><SelectValue placeholder="Asignar a..." /></SelectTrigger>
              <SelectContent>
                {empleados.map((e) => (
                  <SelectItem key={e.user_id} value={e.user_id}>{e.display_name || e.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label="Servicio">
          <Select value={form.servicio_id} onValueChange={(v) => set("servicio_id", v)}>
            <SelectTrigger><SelectValue placeholder="Sin servicio" /></SelectTrigger>
            <SelectContent>
              {servicios.map((s) => (<SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Importe (€)${tarifaAuto != null ? " · autocompletado" : ""}`}>
            <Input type="number" step="0.01" min="0" value={form.importe} onChange={(e) => set("importe", e.target.value)} />
          </Field>
          <Field label="Cantidad ×"><Input type="number" min="1" step="1" value={form.cantidad} onChange={(e) => set("cantidad", e.target.value)} /></Field>
        </div>

        <Field label="Observaciones">
          <Textarea rows={3} value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
        </Field>

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Crear trabajo"}</Button>
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/" })}>Cancelar</Button>
        </div>
      </form>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
