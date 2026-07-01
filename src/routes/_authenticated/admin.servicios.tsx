import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";

export const Route = createFileRoute("/_authenticated/admin/servicios")({ component: AdminServicios });

type Servicio = { id: string; nombre: string; descripcion: string | null; activo: boolean };

function AdminServicios() {
  const { data: me, isLoading } = useUserRole();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nombre: "", descripcion: "" });
  const [saving, setSaving] = useState(false);

  const { data: servicios = [] } = useQuery({
    queryKey: ["servicios"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servicios").select("*").order("nombre");
      if (error) throw error;
      return data as Servicio[];
    },
  });

  if (isLoading) return <AppShell title="Servicios"><div>…</div></AppShell>;
  if (me?.role !== "admin") return <Navigate to="/" />;

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("servicios").insert({
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Servicio creado");
    setForm({ nombre: "", descripcion: "" });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["servicios"] });
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar servicio?")) return;
    const { error } = await supabase.from("servicios").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["servicios"] });
  }

  return (
    <AppShell title="Servicios">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Nuevo servicio</Button>
        </div>
        {servicios.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            Sin servicios. Crea el primero (ej. "Fontanería", "Instalación").
          </div>
        ) : (
          <div className="divide-y rounded-lg border bg-card">
            {servicios.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-semibold">{s.nombre}</div>
                  {s.descripcion && <div className="text-sm text-muted-foreground">{s.descripcion}</div>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => eliminar(s.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo servicio</DialogTitle></DialogHeader>
            <form onSubmit={crear} className="space-y-3">
              <div><Label>Nombre *</Label><Input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
              <div><Label>Descripción</Label><Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "..." : "Crear"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
