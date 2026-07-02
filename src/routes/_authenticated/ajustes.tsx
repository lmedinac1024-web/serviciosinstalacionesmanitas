import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { LogOut, Star } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";

export const Route = createFileRoute("/_authenticated/ajustes")({ component: Ajustes });

type Destino = { id: string; nombre: string };

function Ajustes() {
  const { data: me } = useUserRole();
  const [permitidos, setPermitidos] = useState<string[]>([]);
  const [favoritos, setFavoritos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const { data: destinos = [] } = useQuery({
    queryKey: ["telegram-destinos", "activos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("telegram_destinos")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");
      return (data ?? []) as Destino[];
    },
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("user_settings")
        .select("telegram_destinos_permitidos, telegram_destinos_favoritos")
        .maybeSingle();
      setPermitidos(data?.telegram_destinos_permitidos ?? []);
      setFavoritos(data?.telegram_destinos_favoritos ?? []);
      setLoading(false);
    })();
  }, []);

  const permitidosSet = useMemo(() => new Set(permitidos), [permitidos]);
  const favoritosSet = useMemo(() => new Set(favoritos), [favoritos]);

  function togglePermitido(id: string) {
    setPermitidos((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      // si dejamos de permitir, también quitamos de favoritos
      if (!next.includes(id)) setFavoritos((f) => f.filter((x) => x !== id));
      return next;
    });
  }

  function toggleFavorito(id: string) {
    if (!permitidosSet.has(id)) {
      // primero debe estar permitido
      setPermitidos((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
    setFavoritos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const favLimpios = favoritos.filter((id) => permitidos.includes(id));
      const { error } = await supabase.from("user_settings").upsert({
        user_id: userData.user.id,
        telegram_destinos_permitidos: permitidos,
        telegram_destinos_favoritos: favLimpios,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setFavoritos(favLimpios);
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
    const { data } = await supabase.from('servicios').select("*").order("fecha", { ascending: false });
    if (!data) return;
    const headers = ["ID","Fecha","Hora","Cliente","Tipo","Direccion","Piso","Puerta","CP","Ciudad","Telefono","Estado","Importe","PrecioLlegada","Ganancia","Referencia","Creado","HoraLlegada","HoraFin"];
    const rows = data.map((j) => [j.id, j.fecha, j.hora_programada ?? "", j.cliente, j.tipo_servicio ?? "", j.direccion, j.piso ?? "", j.puerta ?? "", j.codigo_postal ?? "", j.ciudad ?? "", j.telefono_cliente ?? "", j.estado, j.importe, j.precio_llegada, j.ganancia ?? "", j.referencia ?? "", j.creado_en, j.hora_llegada ?? "", j.hora_fin ?? ""]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
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
      <div className="mx-auto max-w-xl space-y-5">
        <section className="rounded-lg border bg-card p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Perfil</div>
          <div className="mt-1 text-lg font-semibold">{me?.displayName || me?.username}</div>
          <div className="text-sm text-muted-foreground">
            @{me?.username} · {me?.role === "admin" ? "Administrador" : "Empleado"}
          </div>
        </section>

        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-base font-semibold">Destinos Telegram</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Marca a qué destinos puedes enviar avisos. Pulsa la ⭐ para dejarlo como
            <b> favorito</b> — los favoritos aparecerán preseleccionados al pulsar
            Llegué o Finalizar.
          </p>

          {loading ? (
            <div className="mt-4 text-sm text-muted-foreground">Cargando…</div>
          ) : destinos.length === 0 ? (
            <div className="mt-4 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
              Aún no hay destinos configurados.{" "}
              {me?.role === "admin"
                ? "Añádelos en el menú Telegram."
                : "Pide al admin que configure destinos."}
            </div>
          ) : (
            <div className="mt-4 divide-y rounded-md border">
              {destinos.map((d) => {
                const permitido = permitidosSet.has(d.id);
                const favorito = favoritosSet.has(d.id);
                return (
                  <label
                    key={d.id}
                    className="flex cursor-pointer items-center justify-between gap-3 p-3 hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={permitido}
                        onCheckedChange={() => togglePermitido(d.id)}
                      />
                      <span className="font-medium">{d.nombre}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        toggleFavorito(d.id);
                      }}
                      className="rounded p-1.5 hover:bg-background"
                      aria-label={favorito ? "Quitar de favoritos" : "Marcar favorito"}
                    >
                      <Star
                        className={
                          "h-5 w-5 " +
                          (favorito
                            ? "fill-yellow-400 text-yellow-500"
                            : "text-muted-foreground")
                        }
                      />
                    </button>
                  </label>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {permitidos.length} permitidos · {favoritos.length} favoritos
            </span>
            <Button onClick={save} disabled={saving || loading}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </section>

        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-base font-semibold">Exportar datos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Descarga trabajos en CSV.</p>
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
