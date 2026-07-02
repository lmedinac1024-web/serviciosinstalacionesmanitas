import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, AlertCircle } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";

export const Route = createFileRoute("/_authenticated/admin/telegram")({ component: AdminTelegram });

// Formato Chat ID Telegram:
//  - Numérico: usuario (positivo), grupo (negativo), supergrupo/canal (-100…)
//  - @username de canal público (5-32 chars, letras/números/_)
const chatIdRegex = /^(-?\d{4,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;

const destinoSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(60, "Máximo 60 caracteres"),
  chat_id: z
    .string()
    .trim()
    .min(1, "El Chat ID es obligatorio")
    .max(40, "Máximo 40 caracteres")
    .regex(
      chatIdRegex,
      "Debe ser un número (ej. 123456789 o -1001234567890) o un @usuario de canal",
    ),
});

type FormErrors = Partial<Record<"nombre" | "chat_id", string>>;

type Destino = { id: string; nombre: string; chat_id: string; activo: boolean };

function AdminTelegram() {
  const { data: me, isLoading } = useUserRole();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Destino | null>(null);
  const [form, setForm] = useState({ nombre: "", chat_id: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  const { data: destinos = [] } = useQuery({
    queryKey: ["telegram-destinos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("telegram_destinos").select("*").order("nombre");
      if (error) throw error;
      return data as Destino[];
    },
  });

  const chatIdsExistentes = useMemo(
    () =>
      new Map(
        destinos.map((d) => [d.chat_id.trim().toLowerCase(), d.id] as const),
      ),
    [destinos],
  );

  if (isLoading) return <AppShell title="Telegram"><div>…</div></AppShell>;
  if (me?.role !== "admin") return <Navigate to="/" />;

  function abrirNuevo() {
    setEditing(null);
    setForm({ nombre: "", chat_id: "" });
    setErrors({});
    setOpen(true);
  }

  function abrirEditar(d: Destino) {
    setEditing(d);
    setForm({ nombre: d.nombre, chat_id: d.chat_id });
    setErrors({});
    setOpen(true);
  }

  function validar(): { ok: true; data: { nombre: string; chat_id: string } } | { ok: false } {
    const parsed = destinoSchema.safeParse(form);
    if (!parsed.success) {
      const next: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormErrors;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      toast.error("Revisa los campos marcados");
      return { ok: false };
    }
    // Duplicado
    const dup = chatIdsExistentes.get(parsed.data.chat_id.toLowerCase());
    if (dup && dup !== editing?.id) {
      setErrors({ chat_id: "Ya existe un destino con este Chat ID" });
      toast.error("Chat ID duplicado");
      return { ok: false };
    }
    setErrors({});
    return { ok: true, data: parsed.data };
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const res = validar();
    if (!res.ok) return;
    setSaving(true);
    const { error } = editing
      ? await supabase.from("telegram_destinos").update(res.data).eq("id", editing.id)
      : await supabase.from("telegram_destinos").insert(res.data);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Destino actualizado" : "Destino añadido");
    setOpen(false);
    setEditing(null);
    setForm({ nombre: "", chat_id: "" });
    setErrors({});
    qc.invalidateQueries({ queryKey: ["telegram-destinos"] });
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar destino?")) return;
    const { error } = await supabase.from("telegram_destinos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["telegram-destinos"] });
  }

  async function toggle(d: Destino) {
    const { error } = await supabase.from("telegram_destinos").update({ activo: !d.activo }).eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success(d.activo ? "Destino desactivado" : "Destino activado");
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
          <Button onClick={abrirNuevo}><Plus className="mr-1.5 h-4 w-4" /> Nuevo destino</Button>
        </div>
        {destinos.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            Sin destinos. Añade al menos uno (ej. "Admin", "Oficina").
          </div>
        ) : (
          <div className="divide-y rounded-lg border bg-card">
            {destinos.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{d.nombre}</span>
                    {!d.activo && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Inactivo
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground truncate">{d.chat_id}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant={d.activo ? "outline" : "secondary"} size="sm" onClick={() => toggle(d)}>
                    {d.activo ? "Desactivar" : "Activar"}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => abrirEditar(d)} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => eliminar(d.id)} aria-label="Eliminar">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar destino Telegram" : "Nuevo destino Telegram"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={guardar} className="space-y-3">
              <div>
                <Label>Nombre *</Label>
                <Input required placeholder="Admin" value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div>
                <Label>Chat ID *</Label>
                <Input required placeholder="123456789" value={form.chat_id}
                  onChange={(e) => setForm({ ...form, chat_id: e.target.value })} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "..." : editing ? "Guardar cambios" : "Añadir"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
