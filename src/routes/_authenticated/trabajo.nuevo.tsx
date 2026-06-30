import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/trabajo/nuevo")({
  component: NuevoTrabajo,
});

function NuevoTrabajo() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    hora: "",
    cliente: "",
    servicio: "",
    direccion: "",
    piso: "",
    puerta: "",
    codigo_postal: "",
    ciudad: "",
    telefono: "",
    importe: "",
    cantidad: "1",
    observaciones: "",
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.cliente.trim() || !form.direccion.trim()) {
      toast.error("Cliente y dirección son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("No autenticado");
      const { data, error } = await supabase
        .from("jobs")
        .insert({
          user_id: userData.user.id,
          fecha: form.fecha,
          hora: form.hora || null,
          cliente: form.cliente.trim(),
          servicio: form.servicio.trim() || null,
          direccion: form.direccion.trim(),
          piso: form.piso.trim() || null,
          puerta: form.puerta.trim() || null,
          codigo_postal: form.codigo_postal.trim() || null,
          ciudad: form.ciudad.trim() || null,
          telefono: form.telefono.trim() || null,
          importe: Number(form.importe) || 0,
          cantidad: Math.max(1, Number(form.cantidad) || 1),
          observaciones: form.observaciones.trim() || null,
        })
        .select()
        .single();
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
      <form onSubmit={submit} className="max-w-2xl space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha"><Input type="date" required value={form.fecha} onChange={(e) => set("fecha", e.target.value)} /></Field>
          <Field label="Hora"><Input type="time" value={form.hora} onChange={(e) => set("hora", e.target.value)} /></Field>
        </div>
        <Field label="Cliente *"><Input required value={form.cliente} onChange={(e) => set("cliente", e.target.value)} /></Field>
        <Field label="Tipo de servicio"><Input value={form.servicio} onChange={(e) => set("servicio", e.target.value)} /></Field>
        <Field label="Dirección *"><Input required value={form.direccion} onChange={(e) => set("direccion", e.target.value)} placeholder="Calle y número" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Piso"><Input value={form.piso} onChange={(e) => set("piso", e.target.value)} /></Field>
          <Field label="Puerta"><Input value={form.puerta} onChange={(e) => set("puerta", e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código postal"><Input value={form.codigo_postal} onChange={(e) => set("codigo_postal", e.target.value)} /></Field>
          <Field label="Ciudad"><Input value={form.ciudad} onChange={(e) => set("ciudad", e.target.value)} /></Field>
        </div>
        <Field label="Teléfono"><Input type="tel" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Importe (€)"><Input type="number" step="0.01" min="0" value={form.importe} onChange={(e) => set("importe", e.target.value)} /></Field>
          <Field label="Cantidad (cuenta ×N)"><Input type="number" min="1" step="1" value={form.cantidad} onChange={(e) => set("cantidad", e.target.value)} /></Field>
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
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
