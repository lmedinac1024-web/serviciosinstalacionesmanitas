import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
import { parseOrdenImagen } from "@/lib/ocr-orden.functions";
import { TIPO_SERVICIO_OPCIONES } from "@/lib/jobs";
import { MapPin, AlertCircle, Navigation, Camera, Upload, X, ScanText, Loader2 } from "lucide-react";
import { haversineMeters } from "@/lib/geo";

export const Route = createFileRoute("/_authenticated/trabajo/nuevo")({ component: NuevoServicio });

type Empleado = { user_id: string; username: string; display_name: string | null };

const DRAFT_KEY = "servihogar-nuevo-servicio-draft-v1";

function createInitialForm() {
  return {
    fecha: new Date().toISOString().slice(0, 10),
    hora: "",
    hora_inicio: "",
    hora_fin: "",
    empleado_id: "",
    tipo_servicio: "",
    cliente: "",
    telefono: "",
    telefonos_extra: "",
    referencia: "",
    direccion: "",
    numero: "",
    piso: "",
    puerta: "",
    codigo_postal: "",
    ciudad: "Barcelona",
    direccion_completa: "",
    observaciones: "",
    importe: "",
    precio_llegada: "",
    numero_operacion: "",
    numero_servicio: "",
    imagen_original_url: "",
    texto_ocr_original: "",
  };
}

type FormState = ReturnType<typeof createInitialForm>;

function restoreDraft(): FormState {
  const initial = createInitialForm();
  if (typeof window === "undefined") return initial;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return initial;
    const saved = JSON.parse(raw) as Partial<FormState>;
    return { ...initial, ...saved, fecha: saved.fecha || initial.fecha };
  } catch {
    return initial;
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
}

function buildDireccionCompleta(f: Pick<FormState, "direccion" | "numero" | "piso" | "puerta" | "codigo_postal" | "ciudad">): string {
  const linea1 = [f.direccion, f.numero, f.piso, f.puerta].filter((s) => (s ?? "").toString().trim()).join(" ").trim();
  const linea2 = [f.codigo_postal, f.ciudad].filter((s) => (s ?? "").toString().trim()).join(" ").trim();
  const partes = [linea1, linea2, "España"].filter(Boolean);
  return partes.join(", ");
}

function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string;
      const [meta, base64] = result.split(",");
      const mime = /data:([^;]+);/.exec(meta)?.[1] ?? file.type ?? "image/jpeg";
      resolve({ base64, mime });
    };
    reader.readAsDataURL(file);
  });
}

function NuevoServicio() {
  const { data: me, isLoading } = useUserRole();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const geocode = useServerFn(geocodeAddress);
  const runOcr = useServerFn(parseOrdenImagen);
  const [geo, setGeo] = useState<{ status: "idle" | "ok" | "fail"; msg?: string; lat?: number; lng?: number }>({ status: "idle" });

  // Importar orden desde imagen
  const [imagen, setImagen] = useState<{ file: File; url: string } | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const camaraRef = useRef<HTMLInputElement | null>(null);
  const archivoRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState<FormState>(restoreDraft);

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

  useEffect(() => {
    return () => { if (imagen) URL.revokeObjectURL(imagen.url); };
  }, [imagen]);

  function set<K extends keyof FormState>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    if (k === "direccion" || k === "codigo_postal" || k === "ciudad" || k === "numero") setGeo({ status: "idle" });
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
  if (!me.canManage) return <Navigate to="/" />;

  function handleFile(file: File | null | undefined) {
    if (!file) return;
    if (imagen) URL.revokeObjectURL(imagen.url);
    setImagen({ file, url: URL.createObjectURL(file) });
  }

  function cancelarImagen() {
    if (imagen) URL.revokeObjectURL(imagen.url);
    setImagen(null);
    if (camaraRef.current) camaraRef.current.value = "";
    if (archivoRef.current) archivoRef.current.value = "";
  }

  async function leerOrden() {
    if (!imagen) return;
    setLeyendo(true);
    try {
      // 1) Leer el fichero a base64 PRIMERO (en iOS/Safari el File de la cámara
      //    puede perder permisos tras el primer await, dando "file could not be read").
      let base64 = "";
      let mime = imagen.file.type || "image/jpeg";
      try {
        const r = await fileToBase64(imagen.file);
        base64 = r.base64;
        mime = r.mime;
      } catch (err) {
        console.error("[leerOrden] FileReader falló", err);
        toast.error("No se pudo leer la imagen. Vuelve a seleccionarla o hazla de nuevo.");
        return;
      }

      // 2) Subir a Storage a partir del base64 (no depende ya del File original)
      let imagenPath = "";
      try {
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: mime });
        const ext = (mime.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
        const path = `${me!.userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("ordenes-imagenes")
          .upload(path, blob, { contentType: mime, upsert: false });
        if (!upErr) imagenPath = path;
      } catch { /* si falla la subida, seguimos con el OCR igual */ }

      // 3) Leer con IA
      const res = await runOcr({ data: { imagenBase64: base64, mime } });
      if (!res.ok) {
        toast.error(`No se pudo leer la orden (${res.reason})`);
        return;
      }
      const c = res.campos;
      setForm((prev) => {
        const next: FormState = {
          ...prev,
          fecha: c.fecha_servicio ?? prev.fecha,
          hora: c.hora_servicio ?? c.hora_inicio ?? prev.hora,
          hora_inicio: c.hora_inicio ?? prev.hora_inicio,
          hora_fin: c.hora_fin ?? prev.hora_fin,
          empleado_id: c.trabajador_id ?? prev.empleado_id,
          tipo_servicio: c.tipo_servicio ?? prev.tipo_servicio,
          cliente: c.nombre_cliente ?? prev.cliente,
          telefono: c.telefono ?? prev.telefono,
          telefonos_extra: (c.telefonos_extra ?? []).join(", ") || prev.telefonos_extra,
          direccion: c.direccion ?? prev.direccion,
          numero: c.numero ?? prev.numero,
          piso: c.piso ?? prev.piso,
          puerta: c.puerta ?? prev.puerta,
          codigo_postal: c.codigo_postal ?? prev.codigo_postal,
          ciudad: c.ciudad ?? prev.ciudad,
          direccion_completa: c.direccion_completa ?? prev.direccion_completa,
          observaciones: c.observaciones ?? prev.observaciones,
          importe: c.precio_servicio != null ? String(c.precio_servicio) : prev.importe,
          precio_llegada: c.precio_llegada != null ? String(c.precio_llegada) : prev.precio_llegada,
          numero_operacion: c.numero_operacion ?? prev.numero_operacion,
          numero_servicio: c.numero_servicio ?? prev.numero_servicio,
          imagen_original_url: imagenPath || prev.imagen_original_url,
          texto_ocr_original: res.texto_ocr || prev.texto_ocr_original,
        };
        return next;
      });
      setGeo({ status: "idle" });

      if (res.aviso_cp) toast.warning("Código postal corregido automáticamente, revisar");
      if (res.aviso_cliente) toast.warning("Cliente sin nombre, revisar antes de guardar");
      if (res.aviso_trabajador) toast.warning("No se encontró trabajador coincidente, selecciona uno manualmente");
      toast.success("Orden leída — revisa los datos antes de crear el servicio");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error leyendo la orden");
    } finally {
      setLeyendo(false);
    }
  }

  async function tryGeocode() {
    if (!form.direccion.trim()) return null;
    try {
      const direccionCompleta = form.direccion_completa || buildDireccionCompleta(form);
      const res = await geocode({
        data: {
          direccion: direccionCompleta || [form.direccion, form.numero].filter(Boolean).join(" "),
          codigo_postal: form.codigo_postal,
          ciudad: form.ciudad,
        },
      });
      if (res.ok) {
        setGeo({ status: "ok", lat: res.lat, lng: res.lng, msg: res.formatted });
        toast.success("Dirección verificada correctamente");
        return { lat: res.lat, lng: res.lng };
      }
      setGeo({ status: "fail", msg: "reason" in res ? res.reason : "error" });
      toast.warning("Ubicación no disponible");
      return null;
    } catch (e) {
      setGeo({ status: "fail", msg: e instanceof Error ? e.message : "error" });
      return null;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.empleado_id) return toast.error("Falta trabajador asignado");
    if (!form.tipo_servicio) return toast.error("Falta tipo de servicio");
    if (!form.cliente.trim()) return toast.error("Falta nombre del cliente");
    if (!form.telefono.trim()) return toast.error("Falta teléfono");
    if (!form.direccion.trim()) return toast.error("Falta dirección");
    if (!form.numero.trim()) return toast.error("Falta número de calle");
    if (!form.codigo_postal.trim()) return toast.error("Falta código postal");
    if (!form.ciudad.trim()) return toast.error("Falta ciudad");
    if (!form.hora && !form.hora_inicio) return toast.error("Falta hora");
    if (!form.importe) return toast.error("Falta precio del servicio");

    setSaving(true);
    try {
      const coords = await tryGeocode();
      const direccionCompleta = form.direccion_completa || buildDireccionCompleta(form);
      const horaProgramada = form.hora || form.hora_inicio || null;

      const insertPayload = {
        user_id: form.empleado_id,
        empleado_id: form.empleado_id,
        assigned_by: me?.userId ?? null,
        creado_por: me?.userId ?? null,
        cliente_id: null,
        tipo_servicio: form.tipo_servicio || null,
        cliente: form.cliente.trim(),
        telefono_cliente: form.telefono.trim() || null,
        telefonos_extra: form.telefonos_extra.trim() || null,
        referencia: form.referencia.trim() || null,
        direccion: form.direccion.trim(),
        numero: form.numero.trim() || null,
        piso: form.piso.trim() || null,
        puerta: form.puerta.trim() || null,
        codigo_postal: form.codigo_postal.trim() || null,
        ciudad: form.ciudad.trim() || null,
        direccion_completa: direccionCompleta || null,
        fecha: form.fecha,
        hora_programada: horaProgramada,
        hora_inicio: form.hora_inicio || null,
        hora_fin: form.hora_fin || null,
        importe: Number(form.importe) || 0,
        precio_llegada: Number(form.precio_llegada) || 0,
        observaciones: form.observaciones.trim() || null,
        numero_operacion: form.numero_operacion.trim() || null,
        numero_servicio: form.numero_servicio.trim() || null,
        imagen_original_url: form.imagen_original_url || null,
        texto_ocr_original: form.texto_ocr_original || null,
        direccion_lat: coords?.lat ?? null,
        direccion_lng: coords?.lng ?? null,
      };

      const { data, error } = await supabase.from("servicios").insert(insertPayload).select().single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["jobs"] });
      clearDraft();
      toast.success("Servicio creado");
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
        {/* Bloque: Importar orden desde imagen */}
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <ScanText className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Importar orden desde imagen</div>
          </div>
          {!imagen ? (
            <>
              <p className="text-xs text-muted-foreground">
                Sube una foto o captura de la orden de trabajo. La app leerá los datos y rellenará el formulario. Podrás revisar y corregir antes de crear el servicio.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="secondary" onClick={() => camaraRef.current?.click()}>
                  <Camera className="mr-1.5 h-4 w-4" /> Tomar foto
                </Button>
                <Button type="button" variant="secondary" onClick={() => archivoRef.current?.click()}>
                  <Upload className="mr-1.5 h-4 w-4" /> Cargar imagen
                </Button>
                <input
                  ref={camaraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <input
                  ref={archivoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-md border bg-background">
                <img src={imagen.url} alt="Orden" className="max-h-64 w-full object-contain" />
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={leerOrden} disabled={leyendo}>
                  {leyendo ? (<><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Leyendo…</>) : (<><ScanText className="mr-1.5 h-4 w-4" /> Leer orden</>)}
                </Button>
                <Button type="button" variant="outline" onClick={cancelarImagen} disabled={leyendo}>
                  <X className="mr-1.5 h-4 w-4" /> Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha *"><Input type="date" required value={form.fecha} onChange={(e) => set("fecha", e.target.value)} /></Field>
          <Field label="Hora *">
            <Input type="time" value={form.hora} onChange={(e) => set("hora", e.target.value)} />
          </Field>
        </div>


        <Field label="Asignar trabajador *">
          {empleados.length === 0 ? (
            <div className="rounded border bg-muted/40 p-3 text-sm text-muted-foreground">
              No hay trabajadores. Créalos en "Empleados".
            </div>
          ) : (
            <>
              <Select value={form.empleado_id} onValueChange={(v) => set("empleado_id", v)}>
                <SelectTrigger><SelectValue placeholder="Asignar a..." /></SelectTrigger>
                <SelectContent>
                  {empleadosOrdenados.map(({ e, dist }) => (
                    <SelectItem key={e.user_id} value={e.user_id}>
                      <span className="inline-flex items-center gap-2">
                        <span>{e.display_name || e.username}</span>
                        {dist != null && (
                          <span className="text-xs text-muted-foreground">
                            · {dist < 1000 ? `${dist} m` : `${(dist / 1000).toFixed(1)} km`}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {geo.status === "ok" ? (
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Navigation className="h-3 w-3" />
                  Ordenados por cercanía al servicio (según su último trabajo)
                </div>
              ) : (
                <div className="mt-1 text-xs text-muted-foreground">
                  Pulsa "Verificar dirección" para ordenar por proximidad.
                </div>
              )}
            </>
          )}
        </Field>

        <Field label="Tipo de servicio *">
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
            <Field label="Nombre cliente *"><Input required value={form.cliente} onChange={(e) => set("cliente", e.target.value)} placeholder="Juan Pérez" /></Field>
            <Field label="Teléfono *"><Input type="tel" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="+34 600 000 000" /></Field>
          </div>
          <Field label="Teléfonos extra">
            <Input value={form.telefonos_extra} onChange={(e) => set("telefonos_extra", e.target.value)} placeholder="Separados por coma" />
          </Field>
          <div className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            La referencia se genera automáticamente al crear el servicio (formato <b>SVH-YYYYMMDD-XXXXXX</b>).
          </div>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Dirección *"><Input required value={form.direccion} onChange={(e) => set("direccion", e.target.value)} placeholder="Calle Mayor" /></Field>
            <Field label="Número *"><Input required value={form.numero} onChange={(e) => set("numero", e.target.value)} placeholder="12" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Piso"><Input value={form.piso} onChange={(e) => set("piso", e.target.value)} placeholder="3" /></Field>
            <Field label="Puerta"><Input value={form.puerta} onChange={(e) => set("puerta", e.target.value)} placeholder="B" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código postal *"><Input required value={form.codigo_postal} onChange={(e) => set("codigo_postal", e.target.value)} placeholder="08001" /></Field>
            <Field label="Ciudad *"><Input required value={form.ciudad} onChange={(e) => set("ciudad", e.target.value)} placeholder="Barcelona" /></Field>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" variant="outline" size="sm" onClick={tryGeocode} disabled={!form.direccion}>
              <MapPin className="mr-1.5 h-3.5 w-3.5" /> Verificar dirección
            </Button>
            {geo.status === "ok" && (
              <span className="text-xs text-success">✓ Ubicación encontrada ({geo.lat?.toFixed(5)}, {geo.lng?.toFixed(5)})</span>
            )}
            {geo.status === "fail" && (
              <span className="text-xs text-warning inline-flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {geo.msg === "not_connected"
                  ? "Google Maps no está conectado — se creará sin validación GPS"
                  : geo.msg === "not_found"
                    ? "No encontrada en Google Maps — revisa la dirección"
                    : `Ubicación no disponible (${geo.msg ?? "error"}) — se creará sin validación 100 m`}
              </span>
            )}
          </div>
        </div>

        <Field label="Observaciones / reparación">
          <Textarea rows={4} value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} placeholder="Descripción del trabajo a realizar..." />
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
          El trabajador cobra el <b>precio del servicio</b> si lo realiza, o el <b>precio por llegada</b> si valida GPS a 100 m pero se cancela.
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
