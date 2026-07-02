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
import { Plus, Pencil, Trash2, AlertCircle, Send } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useServerFn } from "@tanstack/react-start";
import { sendTelegramTestMessage } from "@/lib/telegram.functions";

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
  const [testing, setTesting] = useState(false);
  const sendTest = useServerFn(sendTelegramTestMessage);

  async function probar() {
    // Validar chat_id sin exigir nombre para pruebas rápidas
    const parsed = destinoSchema.shape.chat_id.safeParse(form.chat_id);
    if (!parsed.success) {
      setErrors((x) => ({ ...x, chat_id: parsed.error.issues[0]?.message ?? "Chat ID inválido" }));
      toast.error("Chat ID inválido");
      return;
    }
    setTesting(true);
    try {
      const res = await sendTest({ data: { chatId: parsed.data, nombre: form.nombre } });
      if (res.ok) toast.success("Mensaje de prueba enviado ✅");
      else if ("skipped" in res && res.skipped) toast.info("Telegram no conectado.");
      else toast.error(`Error: ${"error" in res ? res.error : "desconocido"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error enviando prueba");
    } finally {
      setTesting(false);
    }
  }

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
  if (!me?.isAdmin) return <Navigate to="/" />;

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
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      setTesting(true);
                      try {
                        const res = await sendTest({ data: { chatId: d.chat_id, nombre: d.nombre } });
                        if (res.ok) toast.success(`Prueba enviada a ${d.nombre}`);
                        else if ("skipped" in res && res.skipped) toast.info("Telegram no conectado.");
                        else toast.error(`Error: ${"error" in res ? res.error : "desconocido"}`);
                      } finally { setTesting(false); }
                    }}
                    disabled={testing || !d.activo}
                    aria-label="Probar envío"
                    title={d.activo ? "Enviar mensaje de prueba" : "Activa el destino para probar"}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
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
            <form onSubmit={guardar} noValidate className="space-y-3">
              <div>
                <Label htmlFor="dest-nombre">Nombre *</Label>
                <Input
                  id="dest-nombre"
                  placeholder="Admin"
                  maxLength={60}
                  value={form.nombre}
                  aria-invalid={!!errors.nombre}
                  onChange={(e) => {
                    setForm({ ...form, nombre: e.target.value });
                    if (errors.nombre) setErrors((x) => ({ ...x, nombre: undefined }));
                  }}
                />
                {errors.nombre && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" /> {errors.nombre}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="dest-chatid">Chat ID *</Label>
                <Input
                  id="dest-chatid"
                  placeholder="123456789 o @canal"
                  maxLength={40}
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={form.chat_id}
                  aria-invalid={!!errors.chat_id}
                  onChange={(e) => {
                    setForm({ ...form, chat_id: e.target.value });
                    if (errors.chat_id) setErrors((x) => ({ ...x, chat_id: undefined }));
                  }}
                />
                {errors.chat_id ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" /> {errors.chat_id}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Solo números (usuario/grupo) o @usuario de canal público.
                  </p>
                )}
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={probar}
                  disabled={testing || !form.chat_id.trim()}
                >
                  <Send className="mr-1.5 h-4 w-4" />
                  {testing ? "Enviando..." : "Probar envío"}
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "..." : editing ? "Guardar cambios" : "Añadir"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
