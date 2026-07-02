import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Phone, MessageCircle, MapPin, CheckCircle2, XCircle, Camera, ImageIcon, User, Navigation,
} from "lucide-react";
import {
  CANCEL_REASONS, STATUS_LABELS, formatEUR, googleMapsUrl, isCancelled,
  jobTotal, telUrl, whatsappUrl, type Job, type JobStatus,
} from "@/lib/jobs";
import { sendJobUpdateToTelegram } from "@/lib/telegram.functions";
import { useServerFn } from "@tanstack/react-start";
import { useUserRole } from "@/hooks/useUserRole";
import { useOnline } from "@/hooks/useOnline";
import { enqueue as enqueueOffline, processQueue } from "@/lib/offline-queue";
import { getCurrentPosition, haversineMeters } from "@/lib/geo";

const ARRIVAL_RADIUS_M = 100;

interface ArrivalMeta {
  lat: number;
  lng: number;
  distanceM: number | null;
  validated: boolean;
}

export const Route = createFileRoute("/_authenticated/trabajo/$id")({ component: Detalle });

async function uploadPhoto(jobId: string, fase: "inicio" | "final", file: File) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("No autenticado");
  const path = `${userData.user.id}/${jobId}/${fase}-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("job-photos")
    .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (error) throw error;
  return `job-photos/${path}`;
}

async function signedUrl(storagePath: string | null): Promise<string | null> {
  if (!storagePath) return null;
  const [bucket, ...rest] = storagePath.split("/");
  const { data } = await supabase.storage.from(bucket).createSignedUrl(rest.join("/"), 3600);
  return data?.signedUrl ?? null;
}

function Detalle() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useUserRole();
  const online = useOnline();
  const sendTg = useServerFn(sendJobUpdateToTelegram);
  const startInput = useRef<HTMLInputElement>(null);
  const finalInput = useRef<HTMLInputElement>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [destOpen, setDestOpen] = useState<"inicio" | "final" | null>(null);
  const [selectedDest, setSelectedDest] = useState<string[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [arrivalMeta, setArrivalMeta] = useState<ArrivalMeta | null>(null);
  const [checkingGps, setCheckingGps] = useState(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ["jobs", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Job;
    },
  });

  const { data: empleado } = useQuery({
    queryKey: ["profile", job?.empleado_id],
    enabled: !!job?.empleado_id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("display_name, username").eq("user_id", job!.empleado_id!).maybeSingle();
      return data;
    },
  });

  const { data: destinos = [] } = useQuery({
    queryKey: ["telegram-destinos"],
    queryFn: async () => {
      const { data } = await supabase.from("telegram_destinos").select("id, nombre").eq("activo", true).order("nombre");
      return data ?? [];
    },
  });

  const { data: userSettings } = useQuery({
    queryKey: ["user-settings-destinos"],
    queryFn: async () => {
      const { data } = await supabase.from("user_settings")
        .select("telegram_destinos_permitidos, telegram_destinos_favoritos, telegram_destino_default_id")
        .maybeSingle();
      return data;
    },
  });

  const permitidosIds: string[] = (userSettings?.telegram_destinos_permitidos as string[] | null) ?? [];
  const favoritosIds: string[] = (userSettings?.telegram_destinos_favoritos as string[] | null) ?? [];
  const destinosDisponibles = destinos.filter((d) =>
    permitidosIds.length === 0 ? true : permitidosIds.includes(d.id),
  );

  const { data: fotoInicioUrl } = useQuery({
    queryKey: ["photo", job?.foto_inicio], enabled: !!job?.foto_inicio,
    queryFn: () => signedUrl(job?.foto_inicio ?? null),
  });
  const { data: fotoFinalUrl } = useQuery({
    queryKey: ["photo", job?.foto_final], enabled: !!job?.foto_final,
    queryFn: () => signedUrl(job?.foto_final ?? null),
  });

  if (isLoading || !job) {
    return <AppShell title="Trabajo"><div className="text-sm text-muted-foreground">Cargando...</div></AppShell>;
  }

  async function notifyTelegram(jobId: string, fase: "inicio" | "final", destinoIds: string[]) {
    try {
      const res = await sendTg({ data: { jobId, fase, destinoIds } });
      if (res.ok) toast.success("Enviado a Telegram");
      else if (res.skipped) {
        if (res.reason === "telegram_not_connected") toast.info("Telegram no conectado.");
        else if (res.reason === "no_chat_id") toast.info("Sin destino Telegram configurado.");
      } else toast.error(`Telegram: ${"error" in res ? res.error : "error"}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error Telegram"); }
  }

  function pickPhoto(fase: "inicio" | "final") {
    if (fase === "inicio") startInput.current?.click();
    else finalInput.current?.click();
  }

  async function handleArrivalTap() {
    setCheckingGps(true);
    try {
      let meta: ArrivalMeta | null = null;
      try {
        const pos = await getCurrentPosition();
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (job?.lat != null && job?.lng != null) {
          const dist = haversineMeters({ lat, lng }, { lat: Number(job.lat), lng: Number(job.lng) });
          const validated = dist <= ARRIVAL_RADIUS_M;
          meta = { lat, lng, distanceM: dist, validated };
          if (!validated) {
            const ok = window.confirm(
              `Estás a ${dist} m del cliente (fuera del radio de ${ARRIVAL_RADIUS_M} m). ` +
              `Se registrará SIN validación (no cobrarás precio por llegada). ¿Continuar?`,
            );
            if (!ok) return;
          } else {
            toast.success(`Llegada validada (${dist} m)`);
          }
        } else {
          meta = { lat, lng, distanceM: null, validated: false };
          toast.info("Servicio sin coordenadas — no se puede validar el radio 100 m");
        }
      } catch (e) {
        const ok = window.confirm(
          `No se pudo obtener el GPS (${e instanceof Error ? e.message : "error"}). ` +
          `Continuar sin validar la llegada?`,
        );
        if (!ok) return;
        meta = null;
      }
      setArrivalMeta(meta);
      pickPhoto("inicio");
    } finally {
      setCheckingGps(false);
    }
  }

  async function onPhotoSelected(fase: "inicio" | "final", file: File) {
    // Siempre mostrar selector con checkboxes (favoritos premarcados)
    setPendingFile(file);
    // Preseleccionar favoritos que estén disponibles; si no hay, default_id; si tampoco, vacío
    const pre = favoritosIds.filter((id) => destinosDisponibles.some((d) => d.id === id));
    const fallbackDefault = userSettings?.telegram_destino_default_id;
    setSelectedDest(
      pre.length > 0
        ? pre
        : fallbackDefault && destinosDisponibles.some((d) => d.id === fallbackDefault)
          ? [fallbackDefault]
          : [],
    );
    setDestOpen(fase);
  }


  async function savePhotoAndNotify(fase: "inicio" | "final", file: File, destinoIds: string[]) {
    setWorking(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("No autenticado");

      if (!online) {
        await enqueueOffline({
          jobId: job!.id,
          userId,
          kind: fase,
          destinoIds,
          photo: file,
          photoName: file.name,
          arrivalLat: fase === "inicio" ? arrivalMeta?.lat : undefined,
          arrivalLng: fase === "inicio" ? arrivalMeta?.lng : undefined,
          arrivalDistanceM: fase === "inicio" ? arrivalMeta?.distanceM ?? null : undefined,
          arrivalValidated: fase === "inicio" ? arrivalMeta?.validated ?? false : undefined,
        });
        qc.setQueryData(["jobs", job!.id], (old: Job | undefined) =>
          old ? {
            ...old,
            estado: fase === "inicio" ? "en_proceso" : "realizado",
            finalizado_at: fase === "final" ? new Date().toISOString() : old.finalizado_at,
          } : old,
        );
        toast.success(fase === "inicio"
          ? "Guardado offline — se subirá al recuperar conexión"
          : "Finalización guardada offline — se subirá al recuperar conexión");
      } else {
        const path = await uploadPhoto(job!.id, fase, file);
        const patch = fase === "inicio"
          ? {
              foto_inicio: path,
              estado: "en_proceso" as const,
              llegada_lat: arrivalMeta?.lat ?? null,
              llegada_lng: arrivalMeta?.lng ?? null,
              llegada_distancia_m: arrivalMeta?.distanceM ?? null,
              llegada_validada: arrivalMeta?.validated ?? false,
            }
          : { foto_final: path, estado: "realizado" as const, finalizado_at: new Date().toISOString() };
        const { error } = await supabase.from("jobs").update(patch).eq("id", job!.id);
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["jobs"] });
        toast.success(fase === "inicio" ? "Trabajo iniciado" : "Trabajo finalizado");
        void notifyTelegram(job!.id, fase, destinoIds);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error subiendo foto");
    } finally {
      setWorking(false);
      setPendingFile(null);
      setDestOpen(null);
      if (fase === "inicio") setArrivalMeta(null);
    }
  }

  async function cancelar(motivo: JobStatus) {
    setWorking(true);
    try {
      if (!online) {
        await enqueueOffline({
          jobId: job!.id,
          userId: (await supabase.auth.getUser()).data.user?.id ?? "",
          kind: "cancelar",
          motivo: `${motivo}|${STATUS_LABELS[motivo]}`,
        });
        qc.setQueryData(["jobs", job!.id], (old: Job | undefined) =>
          old ? { ...old, estado: motivo, motivo_cancelacion: STATUS_LABELS[motivo] } : old,
        );
        toast.success("Cancelación guardada offline");
      } else {
        const { error } = await supabase.from("jobs")
          .update({ estado: motivo, motivo_cancelacion: STATUS_LABELS[motivo] }).eq("id", job!.id);
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["jobs"] });
        toast.success("Trabajo cancelado");
        // por si había algo encolado
        void processQueue();
      }
      setCancelOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    finally { setWorking(false); }
  }

  const canStart = job.estado === "pendiente";
  const canFinish = job.estado === "en_proceso" || job.estado === "pendiente";
  const isDone = job.estado === "realizado" || isCancelled(job.estado);

  return (
    <AppShell title="Trabajo">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Header */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{job.fecha}{job.hora && ` · ${job.hora}`}</div>
              <h2 className="mt-1 text-xl font-bold">{job.cliente}</h2>
              {job.servicio && <div className="text-sm text-muted-foreground">{job.servicio}</div>}
              {me?.role === "admin" && empleado && (
                <div className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                  <User className="h-3 w-3" /> {empleado.display_name || empleado.username}
                </div>
              )}
            </div>
            <StatusBadge status={job.estado} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] uppercase text-muted-foreground">Importe</div>
              <div className="text-lg font-semibold">{formatEUR(job.importe)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-muted-foreground">Total (× {job.cantidad})</div>
              <div className="text-lg font-bold text-primary">{formatEUR(jobTotal(job))}</div>
            </div>
          </div>
        </div>

        {/* Address & contact */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div className="text-sm">
              <div>{job.direccion}</div>
              {(job.piso || job.puerta) && (
                <div className="text-muted-foreground">
                  {job.piso && `Piso ${job.piso}`}{job.piso && job.puerta && " · "}{job.puerta && `Puerta ${job.puerta}`}
                </div>
              )}
              <div className="text-muted-foreground">{[job.codigo_postal, job.ciudad].filter(Boolean).join(" ")}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <a href={googleMapsUrl(job)} target="_blank" rel="noreferrer">
              <Button variant="outline" className="w-full"><MapPin className="mr-1.5 h-4 w-4" /> Mapa</Button>
            </a>
            <a href={telUrl(job.telefono)}>
              <Button variant="outline" className="w-full" disabled={!job.telefono}><Phone className="mr-1.5 h-4 w-4" /> Llamar</Button>
            </a>
            <a href={whatsappUrl(job.telefono)} target="_blank" rel="noreferrer">
              <Button variant="outline" className="w-full" disabled={!job.telefono}><MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp</Button>
            </a>
          </div>
        </div>

        {/* Actions */}
        {!isDone && (
          <div className="space-y-2">
            {canStart && (
              <Button
                size="lg"
                className="h-14 w-full text-base"
                onClick={handleArrivalTap}
                disabled={working || checkingGps}
                title={!online ? "Se guardará offline y se subirá al recuperar conexión" : undefined}
              >
                {checkingGps ? (
                  <><Navigation className="mr-2 h-5 w-5 animate-pulse" /> Comprobando ubicación...</>
                ) : (
                  <><Camera className="mr-2 h-5 w-5" /> Llegué — Foto de inicio</>
                )}
                {!online && <span className="ml-2 text-xs opacity-80">(offline)</span>}
              </Button>
            )}
            {canFinish && (
              <Button
                size="lg"
                className="h-14 w-full bg-success text-success-foreground text-base hover:bg-success/90"
                onClick={() => pickPhoto("final")}
                disabled={working}
                title={!online ? "Se guardará offline y se subirá al recuperar conexión" : undefined}
              >
                <CheckCircle2 className="mr-2 h-5 w-5" /> Finalizar — Foto final
                {!online && <span className="ml-2 text-xs opacity-80">(offline)</span>}
              </Button>
            )}
            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-12 w-full text-destructive" disabled={working}>
                  <XCircle className="mr-2 h-4 w-4" /> Cancelar trabajo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Motivo de cancelación</DialogTitle></DialogHeader>
                <div className="space-y-2">
                  {CANCEL_REASONS.map((r) => (
                    <Button key={r.value} variant="outline" className="h-12 w-full justify-start"
                      onClick={() => cancelar(r.value)} disabled={working}>
                      {r.label}
                    </Button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        <input ref={startInput} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhotoSelected("inicio", f); e.target.value = ""; }} />
        <input ref={finalInput} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhotoSelected("final", f); e.target.value = ""; }} />

        {/* Destino Telegram picker */}
        <Dialog open={!!destOpen} onOpenChange={(v) => { if (!v) { setDestOpen(null); setPendingFile(null); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {destOpen === "inicio" ? "Enviar foto de inicio" : "Enviar foto final"}
              </DialogTitle>
            </DialogHeader>
            {destinosDisponibles.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No tienes destinos Telegram permitidos. Puedes guardar sin enviar o configurarlos en <b>Ajustes</b>.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{selectedDest.length} de {destinosDisponibles.length} seleccionados</span>
                  <div className="flex gap-3">
                    <button type="button" className="underline"
                      onClick={() => setSelectedDest(destinosDisponibles.map((d) => d.id))}>Todos</button>
                    <button type="button" className="underline"
                      onClick={() => setSelectedDest([])}>Ninguno</button>
                    {favoritosIds.length > 0 && (
                      <button type="button" className="underline"
                        onClick={() => setSelectedDest(favoritosIds.filter((id) => destinosDisponibles.some((d) => d.id === id)))}>
                        Solo favoritos
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {destinosDisponibles.map((d) => {
                    const isFav = favoritosIds.includes(d.id);
                    return (
                      <label key={d.id} className="flex cursor-pointer items-center gap-3 rounded border p-3 hover:bg-accent">
                        <Checkbox
                          checked={selectedDest.includes(d.id)}
                          onCheckedChange={(v) => setSelectedDest((s) => v ? [...s, d.id] : s.filter((x) => x !== d.id))}
                        />
                        <span className="flex-1">{d.nombre}</span>
                        {isFav && <span className="text-yellow-500" title="Favorito">★</span>}
                      </label>
                    );
                  })}
                </div>
              </>
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" disabled={working}
                onClick={() => destOpen && pendingFile && savePhotoAndNotify(destOpen, pendingFile, [])}>
                Guardar sin enviar
              </Button>
              <Button
                disabled={working || selectedDest.length === 0}
                onClick={() => destOpen && pendingFile && savePhotoAndNotify(destOpen, pendingFile, selectedDest)}
              >
                Enviar {selectedDest.length > 0 && `(${selectedDest.length})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        {job.observaciones && (
          <div className="rounded-xl border bg-card p-5">
            <div className="text-[11px] uppercase text-muted-foreground">Observaciones</div>
            <div className="mt-1 whitespace-pre-wrap text-sm">{job.observaciones}</div>
          </div>
        )}

        {isCancelled(job.estado) && job.motivo_cancelacion && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <div className="text-[11px] uppercase text-destructive">Motivo de cancelación</div>
            <div className="mt-1 text-sm">{job.motivo_cancelacion}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <PhotoBox title="Foto inicio" url={fotoInicioUrl} />
          <PhotoBox title="Foto final" url={fotoFinalUrl} />
        </div>

        {me?.role === "admin" && (
          <AdminOverride job={job} onSaved={() => qc.invalidateQueries({ queryKey: ["jobs"] })} />
        )}

        <Button variant="ghost" onClick={() => navigate({ to: "/" })}>← Volver</Button>
      </div>
    </AppShell>
  );
}

function AdminOverride({ job, onSaved }: { job: Job; onSaved: () => void }) {
  const [estado, setEstado] = useState<JobStatus>(job.estado);
  const [validada, setValidada] = useState<boolean>(job.llegada_validada);
  const [importe, setImporte] = useState<string>(String(job.importe ?? 0));
  const [precioLlegada, setPrecioLlegada] = useState<string>(String(job.precio_llegada ?? 0));
  const [motivo, setMotivo] = useState<string>(job.motivo_cancelacion ?? "");
  const [fecha, setFecha] = useState<string>(job.fecha);
  const [saving, setSaving] = useState(false);

  const cancelled = estado.startsWith("cancelado");

  async function save() {
    setSaving(true);
    try {
      const patch = {
        estado,
        llegada_validada: validada,
        importe: Number(importe) || 0,
        precio_llegada: Number(precioLlegada) || 0,
        motivo_cancelacion: cancelled ? (motivo || STATUS_LABELS[estado]) : null,
        fecha,
        finalizado_at: estado === "realizado" && !job.finalizado_at ? new Date().toISOString() : job.finalizado_at,
      };
      const { error } = await supabase.from("jobs").update(patch).eq("id", job.id);
      if (error) throw error;
      toast.success("Trabajo actualizado");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-primary font-semibold">Admin — Actualizar trabajo</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Edita trabajos pasados sin GPS ni foto. Marca la llegada como validada para que el empleado cobre.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Estado</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value as JobStatus)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
            {(Object.keys(STATUS_LABELS) as JobStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Importe (€)</label>
          <input type="number" step="0.01" min="0" value={importe} onChange={(e) => setImporte(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Precio por llegada (€)</label>
          <input type="number" step="0.01" min="0" value={precioLlegada} onChange={(e) => setPrecioLlegada(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        </div>
      </div>

      <label className="flex items-start gap-2 rounded-md border bg-background p-3 text-sm cursor-pointer">
        <Checkbox checked={validada} onCheckedChange={(v) => setValidada(!!v)} className="mt-0.5" />
        <div>
          <div className="font-medium">Llegada validada (sin GPS)</div>
          <div className="text-xs text-muted-foreground">
            Marca esto para aprobar manualmente la llegada del empleado. Necesario para que cobre el precio por llegada si el trabajo se canceló.
          </div>
        </div>
      </label>

      {cancelled && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Motivo de cancelación</label>
          <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder={STATUS_LABELS[estado]}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        </div>
      )}

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? "Guardando..." : "Guardar cambios (admin)"}
      </Button>
    </div>
  );
}

function PhotoBox({ title, url }: { title: string; url?: string | null }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">{title}</div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={title} className="aspect-square w-full object-cover" />
        </a>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center text-muted-foreground">
          <ImageIcon className="h-8 w-8 opacity-40" />
        </div>
      )}
    </div>
  );
}
