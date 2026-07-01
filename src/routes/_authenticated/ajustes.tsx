import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";

export const Route = createFileRoute("/_authenticated/ajustes")({ component: Ajustes });

const NONE_VALUE = "__none__";

function Ajustes() {
  const { data: me } = useUserRole();
  const [destinoId, setDestinoId] = useState<string>(NONE_VALUE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const { data: destinos = [] } = useQuery({
    queryKey: ["telegram-destinos"],
    queryFn: async () => {
      const { data } = await supabase.from("telegram_destinos").select("id, nombre").eq("activo", true).order("nombre");
      return data ?? [];
    },
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("user_settings").select("telegram_destino_default_id").maybeSingle();
      setDestinoId(data?.telegram_destino_default_id ?? NONE_VALUE);
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { error } = await supabase.from("user_settings").upsert({
        user_id: userData.user.id,
        telegram_destino_default_id: destinoId === NONE_VALUE ? null : destinoId,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Ajustes guardados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally { setSaving(false); }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  async function exportCSV() {
    const { data } = await supabase.from("jobs").select("*").order("fecha", { ascending: false });
    if (!data) return;
    const headers = ["ID","Fecha","Hora","Cliente","Servicio","Direccion","Piso","Puerta","CP","Ciudad","Telefono","Estado","Importe","Cantidad","Total","Creado","Finalizado"];
    const rows = data.map((j) => [j.id, j.fecha, j.hora ?? "", j.cliente, j.servicio ?? "", j.direccion, j.piso ?? "", j.puerta ?? "", j.codigo_postal ?? "", j.ciudad ?? "", j.telefono ?? "", j.estado, j.importe, j.cantidad, j.total ?? "", j.created_at, j.finalizado_at ?? ""]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `trabajos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <AppShell title="Ajustes">
      <div className="mx-auto max-w-xl space-y-5">
        <section className="rounded-lg border bg-card p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Perfil</div>
          <div className="mt-1 text-lg font-semibold">{me?.displayName || me?.username}</div>
          <div className="text-sm text-muted-foreground">@{me?.username} · {me?.role === "admin" ? "Administrador" : "Empleado"}</div>
        </section>

        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-base font-semibold">Destino Telegram por defecto</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A dónde se enviarán los avisos de llegada y finalización si no eliges otro destino en el momento.
          </p>
          <div className="mt-4 space-y-3">
            <Label>Destino</Label>
            <Select value={destinoId} onValueChange={setDestinoId} disabled={loading}>
              <SelectTrigger><SelectValue placeholder="Sin destino" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Ninguno (preguntar cada vez)</SelectItem>
                {destinos.map((d) => (<SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>))}
              </SelectContent>
            </Select>
            {destinos.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Aún no hay destinos configurados. {me?.role === "admin" ? "Añádelos en Telegram (menú admin)." : "Pide al admin que configure destinos."}
              </p>
            )}
            <Button onClick={save} disabled={saving || loading}>{saving ? "Guardando..." : "Guardar"}</Button>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-base font-semibold">Exportar datos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Descarga trabajos en CSV.</p>
          <Button variant="outline" className="mt-3" onClick={exportCSV}>Descargar CSV</Button>
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
