import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ajustes")({
  component: Ajustes,
});

function Ajustes() {
  const [chatId, setChatId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("user_settings")
        .select("telegram_chat_id")
        .maybeSingle();
      setChatId(data?.telegram_chat_id ?? "");
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { error } = await supabase
        .from("user_settings")
        .upsert({
          user_id: userData.user.id,
          telegram_chat_id: chatId || null,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      toast.success("Ajustes guardados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  async function exportCSV() {
    const { data } = await supabase.from("jobs").select("*").order("fecha", { ascending: false });
    if (!data) return;
    const headers = [
      "ID","Fecha","Hora","Cliente","Servicio","Direccion","Piso","Puerta",
      "CP","Ciudad","Telefono","Estado","Motivo","Importe","Cantidad","Total",
      "Observaciones","Creado","Finalizado",
    ];
    const rows = data.map((j) => [
      j.id, j.fecha, j.hora ?? "", j.cliente, j.servicio ?? "",
      j.direccion, j.piso ?? "", j.puerta ?? "", j.codigo_postal ?? "",
      j.ciudad ?? "", j.telefono ?? "", j.estado, j.motivo_cancelacion ?? "",
      j.importe, j.cantidad, j.total ?? "", (j.observaciones ?? "").replace(/\n/g, " "),
      j.created_at, j.finalizado_at ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trabajos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell title="Ajustes">
      <div className="max-w-xl space-y-6">
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-base font-semibold">Notificaciones por Telegram</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuando marques un trabajo como iniciado o finalizado, se enviará una notificación con
            la foto al chat de Telegram que configures aquí.
          </p>
          <div className="mt-4 space-y-2">
            <Label htmlFor="chat">Chat ID de Telegram</Label>
            <Input
              id="chat"
              placeholder="123456789"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Para obtener tu chat ID: abre Telegram, busca <b>@userinfobot</b>, pulsa /start y
              copia el número que te devuelve. También funciona el ID de un grupo (negativo).
            </p>
            <Button onClick={save} disabled={saving || loading}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-base font-semibold">Exportar datos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Descarga todos tus trabajos en formato CSV (compatible con Excel y Google Sheets).
          </p>
          <Button variant="outline" className="mt-3" onClick={exportCSV}>
            Descargar CSV
          </Button>
        </section>

        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-base font-semibold">Sesión</h2>
          <Button variant="outline" className="mt-3" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
          </Button>
        </section>
      </div>
    </AppShell>
  );
}
