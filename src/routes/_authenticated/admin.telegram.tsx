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

export const Route = createFileRoute("/_authenticated/admin/telegram")({ component: AdminTelegram });

type Destino = { id: string; nombre: string; chat_id: string; activo: boolean };

function AdminTelegram() {
  const { data: me, isLoading } = useUserRole();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nombre: "", chat_id: "" });
  const [saving, setSaving] = useState(false);

  const { data: destinos = [] } = useQuery({
    queryKey: ["telegram-destinos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("telegram_destinos").select("*").order("nombre");
      if (error) throw error;
      return data as Destino[];
    },
  });

  if (isLoading) return <AppShell title="Telegram"><div>…</div></AppShell>;
  if (me?.role !== "admin") return <Navigate to="/" />;

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.chat_id.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("telegram_destinos").insert({
      nombre: form.nombre.trim(), chat_id: form.chat_id.trim(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Destino añadido");
    setForm({ nombre: "", chat_id: "" });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["telegram-destinos"] });
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar destino?")) return;
    const { error } = await supabase.from("telegram_destinos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["telegram-destinos"] });
  }

  async function toggle(d: Destino) {
    await supabase.from("telegram_destinos").update({ activo: !d.activo }).eq("id", d.id);
    qc.invalidateQueries({ queryKey: ["telegram-destinos"] });
  }

  return (
    <AppShell title="Destinos Telegram">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-lg border bg-muted/40 p-4 text-sm">
          <div className="font-medium">¿Cómo obtener tu Chat ID?</div>
          <div className="mt-1 text-muted-foreground">
            Abre Telegram, busca <b>@userinfobot</b>, pulsa Start y copia el número que aparece como <b>Id</b>.
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Nuevo destino</Button>
        </div>
        {destinos.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            Sin destinos. Añade al menos uno (ej. "Admin", "Oficina").
          </div>
        ) : (
          <div className="divide-y rounded-lg border bg-card">
            {destinos.map((d) => (
              <div key={d.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-semibold">{d.nombre}</div>
                  <div className="font-mono text-xs text-muted-foreground">{d.chat_id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant={d.activo ? "outline" : "secondary"} size="sm" onClick={() => toggle(d)}>
                    {d.activo ? "Activo" : "Inactivo"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => eliminar(d.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo destino Telegram</DialogTitle></DialogHeader>
            <form onSubmit={crear} className="space-y-3">
              <div><Label>Nombre *</Label><Input required placeholder="Admin" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
              <div><Label>Chat ID *</Label><Input required placeholder="123456789" value={form.chat_id} onChange={(e) => setForm({ ...form, chat_id: e.target.value })} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "..." : "Añadir"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
