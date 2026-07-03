import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { useServerFn } from "@tanstack/react-start";
import { geocodeAddress } from "@/lib/geocode.functions";
import { sendJobUpdateToTelegram } from "@/lib/telegram.functions";
import { TIPO_SERVICIO_OPCIONES } from "@/lib/jobs";
import { MapPin, AlertCircle, Navigation } from "lucide-react";
import { haversineMeters } from "@/lib/geo";

export const Route = createFileRoute("/_authenticated/trabajo/nuevo")({ component: NuevoServicio });


type Empleado = { user_id: string; username: string; display_name: string | null };

const DRAFT_KEY = "servihogar-nuevo-servicio-draft-v1";

function createInitialForm() {
  return {
    fecha: new Date().toISOString().slice(0, 10),
    hora: "",
    empleado_id: "",
    tipo_servicio: "",
    cliente: "",
    telefono: "",
    referencia: "",
    direccion: "",
    piso: "",
    puerta: "",
    codigo_postal: "",
    ciudad: "Barcelona",
    observaciones: "",
    importe: "",
    precio_llegada: "",
  };
}

function restoreDraft() {
  const initial = createInitialForm();
  if (typeof window === "undefined") return initial;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return initial;
    const saved = JSON.parse(raw) as Partial<ReturnType<typeof createInitialForm>>;
    return { ...initial, ...saved, fecha: saved.fecha || initial.fecha };
  } catch {
    return initial;
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
}

function NuevoServicio() {
  const { data: me, isLoading, isError } = useUserRole();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const geocode = useServerFn(geocodeAddress);
  const [geo, setGeo] = useState<{ status: "idle" | "ok" | "fail"; msg?: string; lat?: number; lng?: number }>({ status: "idle" });

  const [form, setForm] = useState(restoreDraft);

  const sendTg = useServerFn(sendJobUpdateToTelegram);

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

  // Última ubicación conocida de cada empleado (a partir de sus servicios con coords).
  const { data: ultimasUbicaciones = {} } = useQuery({
    queryKey: ["empleados-ultima-ubicacion"],
    queryFn: async () => {
      const { data } = await supabase
        .from("servicios")
        .select("empleado_id, direccion_lat, direccion_lng, fecha, hora_programada")
        .not("direccion_lat", "is", null)
        .not("direccion_lng", "is", null)
        .order("fecha", { ascending: false })
        .order("hora_programada", { ascending: false })
        .limit(500);
      const map: Record<string, { lat: number; lng: number }> = {};
      for (const r of data ?? []) {
        if (!r.empleado_id || r.direccion_lat == null || r.direccion_lng == null) continue;
        if (!map[r.empleado_id]) map[r.empleado_id] = { lat: Number(r.direccion_lat), lng: Number(r.direccion_lng) };
      }
      return map;
    },
    staleTime: 60_000,
  });

  const empleadosOrdenados = (() => {
    if (geo.status !== "ok" || geo.lat == null || geo.lng == null) return empleados.map((e) => ({ e, dist: null as number | null }));
    const origen = { lat: geo.lat, lng: geo.lng };
    return empleados
      .map((e) => {
        const loc = ultimasUbicaciones[e.user_id];
        const dist = loc ? haversineMeters(origen, loc) : null;
        return { e, dist };
      })
      .sort((a, b) => {
        if (a.dist == null && b.dist == null) return 0;
        if (a.dist == null) return 1;
        if (b.dist == null) return -1;
        return a.dist - b.dist;
      });
  })();

  useEffect(() => {
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* noop */ }
  }, [form]);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    if (k === "direccion" || k === "codigo_postal" || k === "ciudad") setGeo({ status: "idle" });
  }

  if (isLoading) return <AppShell title="Nuevo servicio"><div>…</div></AppShell>;
  if (!me) {
    return (
      <AppShell title="Nuevo servicio">
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Recuperando la sesión… No se perderá lo escrito.
        </div>
      </AppShell>
    );
  }
  if (!me.isAdmin) return <Navigate to="/" />;

  async function tryGeocode() {
    if (!form.direccion.trim()) return null;
    try {
      const res = await geocode({ data: { direccion: form.direccion, codigo_postal: form.codigo_postal, ciudad: form.ciudad } });
      if (res.ok) {
        setGeo({ status: "ok", lat: res.lat, lng: res.lng, msg: res.formatted });
        return { lat: res.lat, lng: res.lng };
      }
      setGeo({ status: "fail", msg: "reason" in res ? res.reason : "error" });
      return null;
    } catch (e) {
      setGeo({ status: "fail", msg: e instanceof Error ? e.message : "error" });
      return null;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.empleado_id) return toast.error("Falta empleado");
    if (!form.cliente.trim()) return toast.error("Falta nombre del cliente");
    if (!form.direccion.trim()) return toast.error("Falta dirección");
    if (!form.importe) return toast.error("Falta precio del servicio");

    setSaving(true);
    try {
      // Geocodificar (si no falla, guardamos coords para validar 100m luego)
      const coords = await tryGeocode();

      const { data, error } = await supabase.from('servicios').insert({
        user_id: form.empleado_id,
        empleado_id: form.empleado_id,
        assigned_by: me?.userId ?? null,
        cliente_id: null,
        tipo_servicio: form.tipo_servicio || null,
        cliente: form.cliente.trim(),
        telefono_cliente: form.telefono.trim() || null,
        referencia: form.referencia.trim() || null,
        direccion: form.direccion.trim(),
        piso: form.piso.trim() || null,
        puerta: form.puerta.trim() || null,
        codigo_postal: form.codigo_postal.trim() || null,
        ciudad: form.ciudad.trim() || null,
        fecha: form.fecha,
        hora_programada: form.hora || null,
        importe: Number(form.importe) || 0,
        precio_llegada: Number(form.precio_llegada) || 0,
        observaciones: form.observaciones.trim() || null,
        direccion_lat: coords?.lat ?? null,
        direccion_lng: coords?.lng ?? null,
      }).select().single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["jobs"] });
      clearDraft();
      toast.success("Servicio creado");
      // Aviso Telegram (creación) — fire and forget
      void sendTg({ data: { jobId: data.id, fase: "creado" } }).catch(() => { /* noop */ });
      navigate({ to: "/trabajo/$id", params: { id: data.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Nuevo servicio">
      <form onSubmit={submit} className="mx-auto max-w-2xl space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha *"><Input type="date" required value={form.fecha} onChange={(e) => set("fecha", e.target.value)} /></Field>
          <Field label="Hora"><Input type="time" value={form.hora} onChange={(e) => set("hora", e.target.value)} /></Field>
        </div>

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

        <Field label="Tipo de servicio">
          <Select value={form.tipo_servicio} onValueChange={(v) => set("tipo_servicio", v)}>
            <SelectTrigger><SelectValue placeholder="Manitas / Fontanería / Ventilador…" /></SelectTrigger>
            <SelectContent>
              {TIPO_SERVICIO_OPCIONES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
            </SelectContent>
          </Select>
        </Field>

        <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cliente</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre *"><Input required value={form.cliente} onChange={(e) => set("cliente", e.target.value)} placeholder="Juan Pérez" /></Field>
            <Field label="Teléfono"><Input type="tel" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="+34 600 000 000" /></Field>
          </div>
          <div className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            La referencia se genera automáticamente al crear el servicio (formato <b>SVH-YYYYMMDD-XXXXXX</b>).
          </div>
          <Field label="Dirección *"><Input required value={form.direccion} onChange={(e) => set("direccion", e.target.value)} placeholder="Calle Mayor 12" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Piso"><Input value={form.piso} onChange={(e) => setForm((f) => ({ ...f, piso: e.target.value }))} placeholder="3º" /></Field>
            <Field label="Puerta"><Input value={form.puerta} onChange={(e) => setForm((f) => ({ ...f, puerta: e.target.value }))} placeholder="B" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código postal"><Input value={form.codigo_postal} onChange={(e) => set("codigo_postal", e.target.value)} placeholder="28001" /></Field>
            <Field label="Ciudad"><Input value={form.ciudad} onChange={(e) => set("ciudad", e.target.value)} placeholder="Barcelona" /></Field>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={tryGeocode} disabled={!form.direccion}>
              <MapPin className="mr-1.5 h-3.5 w-3.5" /> Verificar dirección
            </Button>
            {geo.status === "ok" && (
              <span className="text-xs text-success">✓ Ubicación encontrada ({geo.lat?.toFixed(5)}, {geo.lng?.toFixed(5)})</span>
            )}
            {geo.status === "fail" && (
              <span className="text-xs text-warning inline-flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Sin GPS ({geo.msg}) — se creará sin validación 100 m
              </span>
            )}
          </div>
        </div>

        <Field label="Observaciones (qué pide el cliente)">
          <Textarea rows={4} value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} placeholder="Ej: fuga bajo lavabo cocina, cambiar sifón..." />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Precio del servicio (€) *">
            <Input type="number" step="0.01" min="0" required value={form.importe} onChange={(e) => set("importe", e.target.value)} />
          </Field>
          <Field label="Precio por llegada (€)">
            <Input type="number" step="0.01" min="0" value={form.precio_llegada} onChange={(e) => set("precio_llegada", e.target.value)} placeholder="0" />
          </Field>
        </div>
        <div className="text-xs text-muted-foreground -mt-2">
          El empleado cobra el <b>precio del servicio</b> si lo realiza, o el <b>precio por llegada</b> si valida GPS a 100 m pero se cancela.
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Crear servicio"}</Button>
          <Button type="button" variant="outline" onClick={() => { clearDraft(); navigate({ to: "/" }); }}>Cancelar</Button>
        </div>
      </form>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
