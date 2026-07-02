import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/clientes")({
  component: AdminClientes,
});

type Cliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string;
  piso: string | null;
  puerta: string | null;
  codigo_postal: string | null;
  ciudad: string | null;
  notas: string | null;
};

function AdminClientes() {
  const { data: me, isLoading: loadingRole } = useUserRole();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("nombre");
      if (error) throw error;
      return data as Cliente[];
    },
  });

  if (loadingRole) return <AppShell title="Clientes"><div className="text-sm text-muted-foreground">…</div></AppShell>;
  if (me?.role !== "admin") return <Navigate to="/" />;

  async function remove(id: string) {
    if (!confirm("¿Eliminar cliente?")) return;
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["clientes"] });
    toast.success("Eliminado");
  }

  return (
    <AppShell title="Clientes">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" /> Nuevo cliente
          </Button>
        </div>

        {clientes.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            Aún no hay clientes. Crea el primero.
          </div>
        ) : (
          <div className="divide-y rounded-lg border bg-card">
            {clientes.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="font-semibold">{c.nombre}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground truncate">
                    {c.direccion}
                    {c.piso && `, ${c.piso}`}{c.puerta && `-${c.puerta}`}
                    {c.codigo_postal || c.ciudad ? ` · ${[c.codigo_postal, c.ciudad].filter(Boolean).join(" ")}` : ""}
                  </div>
                  {c.telefono && <div className="text-xs text-muted-foreground">{c.telefono}</div>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <ClienteDialog open={open} onOpenChange={setOpen} editing={editing} />
      </div>
    </AppShell>
  );
}

function ClienteDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Cliente | null }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Omit<Cliente, "id">>(() => ({
    nombre: editing?.nombre ?? "",
    telefono: editing?.telefono ?? "",
    direccion: editing?.direccion ?? "",
    piso: editing?.piso ?? "",
    puerta: editing?.puerta ?? "",
    codigo_postal: editing?.codigo_postal ?? "",
    ciudad: editing?.ciudad ?? "Barcelona",
    notas: editing?.notas ?? "",
  }));

  // reset when editing changes
  useEffect(() => {
    setForm({
      nombre: editing?.nombre ?? "",
      telefono: editing?.telefono ?? "",
      direccion: editing?.direccion ?? "",
      piso: editing?.piso ?? "",
      puerta: editing?.puerta ?? "",
      codigo_postal: editing?.codigo_postal ?? "",
      ciudad: editing?.ciudad ?? "",
      notas: editing?.notas ?? "",
    });
  }, [editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.direccion.trim()) return toast.error("Nombre y dirección obligatorios");
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        telefono: form.telefono?.trim() || null,
        direccion: form.direccion.trim(),
        piso: form.piso?.trim() || null,
        puerta: form.puerta?.trim() || null,
        codigo_postal: form.codigo_postal?.trim() || null,
        ciudad: form.ciudad?.trim() || null,
        notas: form.notas?.trim() || null,
      };
      const { error } = editing
        ? await supabase.from("clientes").update(payload).eq("id", editing.id)
        : await supabase.from("clientes").insert(payload);
      if (error) throw error;
      toast.success("Guardado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div><Label>Nombre *</Label><Input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
          <div><Label>Teléfono</Label><Input value={form.telefono ?? ""} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
          <div><Label>Dirección *</Label><Input required value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Piso</Label><Input value={form.piso ?? ""} onChange={(e) => setForm({ ...form, piso: e.target.value })} /></div>
            <div><Label>Puerta</Label><Input value={form.puerta ?? ""} onChange={(e) => setForm({ ...form, puerta: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Código postal</Label><Input value={form.codigo_postal ?? ""} onChange={(e) => setForm({ ...form, codigo_postal: e.target.value })} /></div>
            <div><Label>Ciudad</Label><Input value={form.ciudad ?? ""} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} /></div>
          </div>
          <div><Label>Notas</Label><Textarea rows={2} value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "..." : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
