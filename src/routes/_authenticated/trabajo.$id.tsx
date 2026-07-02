import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Phone, MessageCircle, MapPin, CheckCircle2, XCircle, Camera, ImageIcon, User, Navigation,
} from "lucide-react";
import {
  CANCEL_REASONS, STATUS_LABELS, TIPO_SERVICIO_OPCIONES, formatEUR, googleMapsUrl, isCancelled,
  jobTotal, telUrl, whatsappUrl, type Job, type JobStatus,
} from "@/lib/jobs";
import { useUserRole } from "@/hooks/useUserRole";
import { useOnline } from "@/hooks/useOnline";
import { enqueue as enqueueOffline, processQueue } from "@/lib/offline-queue";
import { getCurrentPosition, haversineMeters } from "@/lib/geo";

const ARRIVAL_RADIUS_M = 100;

type Fase = "inicio" | "final" | "cancel";

interface GpsMeta {
  lat: number;
  lng: number;
  distanceM: number | null;
  validated: boolean;
}

export const Route = createFileRoute("/_authenticated/trabajo/$id")({ component: Detalle });

async function uploadPhoto(jobId: string, fase: Fase, file: File) {
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
  const startInput = useRef<HTMLInputElement>(null);
  const finalInput = useRef<HTMLInputElement>(null);
  const cancelInput = useRef<HTMLInputElement>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [cancelExtra, setCancelExtra] = useState("");
  const [working, setWorking] = useState(false);
  const [destOpen, setDestOpen] = useState<Fase | null>(null);
  const [selectedDest, setSelectedDest] = useState<string[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [gpsMeta, setGpsMeta] = useState<GpsMeta | null>(null);
  const [checkingGps, setCheckingGps] = useState(false);
  const [importeFinal, setImporteFinal] = useState<string>("");
  const [direccionFinal, setDireccionFinal] = useState<string>("");
  const [pisoFinal, setPisoFinal] = useState<string>("");
  const [puertaFinal, setPuertaFinal] = useState<string>("");

  const { data: job, isLoading } = useQuery({
    queryKey: ["jobs", id],
    queryFn: async () => {
      const { data, error } = await supabase.from('servicios').select("*").eq("id", id).single();
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
  const { data: fotoCancelUrl } = useQuery({
    queryKey: ["photo", job?.foto_cancelacion], enabled: !!job?.foto_cancelacion,
    queryFn: () => signedUrl(job?.foto_cancelacion ?? null),
  });

  if (isLoading || !job) {
    return <AppShell title="Servicio"><div className="text-sm text-muted-foreground">Cargando...</div></AppShell>;
  }


  function pickPhoto(fase: Fase) {
    if (fase === "inicio") startInput.current?.click();
    else if (fase === "final") finalInput.current?.click();
    else cancelInput.current?.click();
  }

  async function captureGps(validateAgainstJob: boolean): Promise<GpsMeta | null> {
    try {
      const pos = await getCurrentPosition();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      if (validateAgainstJob && job?.direccion_lat != null && job?.direccion_lng != null) {
        const dist = haversineMeters(
          { lat, lng },
          { lat: Number(job.direccion_lat), lng: Number(job.direccion_lng) },
        );
        return { lat, lng, distanceM: dist, validated: dist <= ARRIVAL_RADIUS_M };
      }
      return { lat, lng, distanceM: null, validated: false };
    } catch {
      return null;
    }
  }

  async function handleArrivalTap() {
    setCheckingGps(true);
    try {
      const meta = await captureGps(true);
      if (meta && meta.distanceM != null) {
        if (!meta.validated) {
          const ok = window.confirm(
            `Estás a ${Math.round(meta.distanceM)} m de la dirección (fuera del radio de ${ARRIVAL_RADIUS_M} m). ` +
            `Se registrará SIN validación. ¿Continuar?`,
          );
          if (!ok) return;
        } else {
          toast.success(`Llegada validada (${Math.round(meta.distanceM)} m)`);
        }
      } else if (!meta) {
        const ok = window.confirm(`No se pudo obtener el GPS. ¿Continuar sin validar?`);
        if (!ok) return;
      } else {
        toast.info("Servicio sin coordenadas — no se puede validar el radio");
      }
      setGpsMeta(meta);
      pickPhoto("inicio");
    } finally {
      setCheckingGps(false);
    }
  }

  async function handleFinishTap() {
    setCheckingGps(true);
    try {
      const meta = await captureGps(false);
      setGpsMeta(meta);
      pickPhoto("final");
    } finally { setCheckingGps(false); }
  }

  async function handleCancelConfirm() {
    if (!cancelReason) { toast.error("Selecciona un motivo"); return; }
    setCheckingGps(true);
    try {
      const meta = await captureGps(false);
      setGpsMeta(meta);
      setCancelOpen(false);
      pickPhoto("cancel");
    } finally { setCheckingGps(false); }
  }

  async function shareFileNative(file: File, fase: Fase) {
    const faseTxt = fase === "inicio" ? "Foto de inicio" : fase === "final" ? "Foto final" : "Foto de cancelación";
    const header = `${faseTxt} — ${job?.cliente ?? ""} · ${job?.referencia ?? ""}`;
    let text = header;
    if (fase === "inicio") {
      text = `${header}\n📍 ${direccionCompleta}`;
    } else if (fase === "cancel") {
      const reasonEntry = cancelReason ? CANCEL_REASONS.find((r) => r.label === cancelReason) ?? null : null;
      const motivo = [reasonEntry?.label ?? "Cancelado", cancelExtra.trim()].filter(Boolean).join(" — ");
      text = `${header}\n❌ Motivo: ${motivo}`;
    }
    try {
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
      if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: faseTxt, text });
        return;
      }
      if (nav.share) {
        await nav.share({ title: faseTxt, text });
        toast.info("Tu dispositivo no soporta adjuntar la foto — comparte manualmente");
        return;
      }
      toast.info("Compartir nativo no disponible en este dispositivo");
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") {
        toast.error("No se pudo abrir el menú compartir");
      }
    }
  }

  async function onPhotoSelected(fase: Fase, file: File) {
    setPendingFile(file);
    await savePhotoAndNotify(fase, file, []);
    await shareFileNative(file, fase);
  }

  async function savePhotoAndNotify(fase: Fase, file: File, destinoIds: string[]) {
    setWorking(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("No autenticado");

      const now = new Date().toISOString();
      const reasonEntry = cancelReason ? CANCEL_REASONS.find((r) => r.label === cancelReason) ?? null : null;
      const motivoFinal =
        fase === "cancel"
          ? [reasonEntry?.label ?? "Cancelado", cancelExtra.trim()].filter(Boolean).join(" — ")
          : null;
      const nextEstado: JobStatus =
        fase === "inicio" ? "en_proceso"
        : fase === "final" ? "realizado"
        : (reasonEntry?.status ?? "cancelado_otro");

      if (!online) {
        await enqueueOffline({
          jobId: job!.id,
          userId,
          kind: fase === "cancel" ? "cancelar" : fase,
          destinoIds,
          photo: file,
          photoName: file.name,
          arrivalLat: gpsMeta?.lat,
          arrivalLng: gpsMeta?.lng,
          arrivalDistanceM: gpsMeta?.distanceM ?? null,
          arrivalValidated: gpsMeta?.validated ?? false,
          motivo: fase === "cancel" ? `${nextEstado}|${motivoFinal}` : undefined,
        });
        qc.setQueryData(["jobs", job!.id], (old: Job | undefined) =>
          old ? {
            ...old,
            estado: nextEstado,
            hora_fin: fase !== "inicio" ? now : old.hora_fin,
            motivo_cancelacion: fase === "cancel" ? motivoFinal : old.motivo_cancelacion,
          } : old,
        );
        toast.success("Guardado offline — se enviará al recuperar conexión");
      } else {
        const path = await uploadPhoto(job!.id, fase, file);
        let patch: Partial<Job> = {};
        if (fase === "inicio") {
          patch = {
            foto_inicio: path,
            estado: "en_proceso",
            hora_llegada: now,
            gps_llegada_lat: gpsMeta?.lat ?? null,
            gps_llegada_lng: gpsMeta?.lng ?? null,
            distancia_llegada_metros: gpsMeta?.distanceM ?? null,
            direccion_validada_llegada: gpsMeta?.validated ?? false,
          };
        } else if (fase === "final") {
          patch = {
            foto_final: path,
            estado: "realizado",
            hora_fin: now,
            gps_final_lat: gpsMeta?.lat ?? null,
            gps_final_lng: gpsMeta?.lng ?? null,
          };
          if (me?.isAdmin) {
            if (importeFinal.trim() !== "") {
              const n = Number(importeFinal);
              if (!Number.isNaN(n) && n >= 0) patch.importe = n;
            }
            if (direccionFinal.trim() !== "") patch.direccion = direccionFinal.trim();
            if (pisoFinal.trim() !== "") patch.piso = pisoFinal.trim();
            if (puertaFinal.trim() !== "") patch.puerta = puertaFinal.trim();
          }
        } else {
          patch = {
            foto_cancelacion: path,
            estado: nextEstado,
            hora_fin: now,
            motivo_cancelacion: motivoFinal,
            gps_cancelacion_lat: gpsMeta?.lat ?? null,
            gps_cancelacion_lng: gpsMeta?.lng ?? null,
          };
        }
        const { error } = await supabase.from('servicios').update(patch).eq("id", job!.id);
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["jobs"] });
        toast.success(fase === "inicio" ? "Trabajo iniciado" : fase === "final" ? "Trabajo finalizado" : "Trabajo cancelado");
        void destinoIds;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error subiendo foto");
    } finally {
      setWorking(false);
      setPendingFile(null);
      setDestOpen(null);
      setGpsMeta(null);
      if (fase === "cancel") { setCancelReason(null); setCancelExtra(""); }
    }
  }

  const canStart = job.estado === "pendiente";
  const canFinish = job.estado === "en_proceso";
  const isDone = job.estado === "realizado" || isCancelled(job.estado);

  const direccionCompleta = [job.direccion, [job.piso && `Piso ${job.piso}`, job.puerta && `Puerta ${job.puerta}`].filter(Boolean).join(" "), job.codigo_postal, job.ciudad].filter(Boolean).join(", ");
  const waMsg = `Hola, soy el técnico. Voy de camino para realizar el servicio programado en la dirección: ${direccionCompleta}.`;

  return (
    <AppShell title="Servicio">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">
                {job.fecha}{job.hora_programada && ` · ${job.hora_programada}`}
              </div>
              <h2 className="mt-1 text-xl font-bold">{job.cliente}</h2>
              {job.tipo_servicio && <div className="text-sm text-muted-foreground">{job.tipo_servicio}</div>}
              {job.referencia && <div className="text-xs text-muted-foreground">Ref: {job.referencia}</div>}
              {me?.isAdmin && empleado && (
                <div className="mt-1 inline-flex items-center gap-1 text-xs text-primary">
                  <User className="h-3 w-3" /> {empleado.display_name || empleado.username}
                </div>
              )}
            </div>
            <StatusBadge status={job.estado} voided={!!job.eliminado_logico} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] uppercase text-muted-foreground">Importe</div>
              <div className="text-lg font-semibold">{formatEUR(job.importe)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-muted-foreground">Ganancia</div>
              <div className="text-lg font-bold text-primary">{formatEUR(jobTotal(job))}</div>
            </div>
          </div>
        </div>

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
              {job.direccion_validada_llegada && (
                <div className="mt-1 text-xs text-success">✅ Llegada validada por GPS</div>
              )}
              {job.distancia_llegada_metros != null && (
                <div className="text-xs text-muted-foreground">Distancia registrada: {Math.round(Number(job.distancia_llegada_metros))} m</div>
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <a href={googleMapsUrl(job)} target="_blank" rel="noreferrer" className="block">
              <button
                type="button"
                className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-xl bg-[#1a73e8] text-white shadow-md transition-transform active:scale-95 hover:brightness-110"
              >
                <MapPin className="h-7 w-7" strokeWidth={2.4} />
                <span className="text-xs font-semibold uppercase tracking-wide">Mapa</span>
              </button>
            </a>
            <a href={telUrl(job.telefono_cliente)} className="block">
              <button
                type="button"
                disabled={!job.telefono_cliente}
                className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-xl bg-[#059669] text-white shadow-md transition-transform active:scale-95 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Phone className="h-7 w-7" strokeWidth={2.4} />
                <span className="text-xs font-semibold uppercase tracking-wide">Llamar</span>
              </button>
            </a>
            <a href={whatsappUrl(job.telefono_cliente, waMsg)} target="_blank" rel="noreferrer" className="block">
              <button
                type="button"
                disabled={!job.telefono_cliente}
                className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-xl bg-[#25D366] text-white shadow-md transition-transform active:scale-95 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MessageCircle className="h-7 w-7" strokeWidth={2.4} />
                <span className="text-xs font-semibold uppercase tracking-wide">WhatsApp</span>
              </button>
            </a>
          </div>
        </div>

        {!isDone && (
          <div className="space-y-2">
            {canStart && (
              <Button
                size="lg"
                className="h-14 w-full text-base"
                onClick={handleArrivalTap}
                disabled={working || checkingGps}
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
              <>
                {me?.isAdmin && (
                  <div className="rounded-md border bg-card p-3 space-y-3">
                    <div className="text-[11px] uppercase tracking-wider text-primary font-semibold">Ajustes admin (opcional)</div>
                    <div>
                      <label className="text-xs font-medium">Importe final (€)</label>
                      <input
                        type="number" step="0.01" min="0"
                        value={importeFinal}
                        onChange={(e) => setImporteFinal(e.target.value)}
                        placeholder={String(job.importe ?? 0)}
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Dirección</label>
                      <input
                        type="text"
                        value={direccionFinal}
                        onChange={(e) => setDireccionFinal(e.target.value)}
                        placeholder={job.direccion ?? ""}
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium">Piso</label>
                        <input
                          type="text"
                          value={pisoFinal}
                          onChange={(e) => setPisoFinal(e.target.value)}
                          placeholder={job.piso ?? "3º"}
                          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Puerta</label>
                        <input
                          type="text"
                          value={puertaFinal}
                          onChange={(e) => setPuertaFinal(e.target.value)}
                          placeholder={job.puerta ?? "B"}
                          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">Los campos vacíos mantienen el valor actual.</div>
                  </div>
                )}
                <Button
                  size="lg"
                  className="h-14 w-full bg-success text-success-foreground text-base hover:bg-success/90"
                  onClick={handleFinishTap}
                  disabled={working || checkingGps}
                >
                  <CheckCircle2 className="mr-2 h-5 w-5" /> Finalizar — Foto final
                  {!online && <span className="ml-2 text-xs opacity-80">(offline)</span>}
                </Button>
              </>
            )}
            <Dialog open={cancelOpen} onOpenChange={(v) => { setCancelOpen(v); if (!v) { setCancelReason(null); setCancelExtra(""); } }}>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-12 w-full text-destructive" disabled={working}>
                  <XCircle className="mr-2 h-4 w-4" /> Cancelar trabajo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Cancelar servicio</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1.5 text-xs font-medium">Motivo *</div>
                    <div className="grid grid-cols-2 gap-2">
                      {CANCEL_REASONS.map((r) => (
                        <Button key={r.label}
                          variant={cancelReason === r.label ? "default" : "outline"}
                          className="h-10 justify-start text-xs"
                          onClick={() => setCancelReason(r.label)}>
                          {r.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs font-medium">Comentario adicional</div>
                    <Textarea
                      value={cancelExtra}
                      onChange={(e) => setCancelExtra(e.target.value)}
                      placeholder="Detalles (opcional)"
                      rows={2}
                    />
                  </div>
                  <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                    Al continuar te pediremos una <b>foto obligatoria</b> y se guardará tu <b>ubicación GPS</b>. Este servicio <b>sí suma ganancia</b> (cancelado por trabajador).
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCancelOpen(false)}>Volver</Button>
                  <Button
                    variant="destructive"
                    onClick={handleCancelConfirm}
                    disabled={!cancelReason || checkingGps}>
                    {checkingGps ? "Ubicación..." : "Continuar y tomar foto"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        <input ref={startInput} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhotoSelected("inicio", f); e.target.value = ""; }} />
        <input ref={finalInput} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhotoSelected("final", f); e.target.value = ""; }} />
        <input ref={cancelInput} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhotoSelected("cancel", f); e.target.value = ""; }} />

        {/* Compartir nativo se dispara automáticamente tras guardar la foto */}


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

        <div className="grid grid-cols-3 gap-3">
          <PhotoBox title="Foto inicio" url={fotoInicioUrl} />
          <PhotoBox title="Foto final" url={fotoFinalUrl} />
          <PhotoBox title="Foto cancel." url={fotoCancelUrl} />
        </div>

        {me?.isAdmin && (
          <AdminOverride
            job={job}
            isSuperAdmin={!!me?.isSuperAdmin}
            onSaved={() => qc.invalidateQueries({ queryKey: ["jobs"] })}
          />
        )}

        <Button variant="ghost" onClick={() => navigate({ to: "/" })}>← Volver</Button>
      </div>
    </AppShell>
  );
}

function AdminOverride({
  job,
  isSuperAdmin,
  onSaved,
}: { job: Job; isSuperAdmin: boolean; onSaved: () => void }) {
  const [estado, setEstado] = useState<JobStatus>(job.estado);
  const [validada, setValidada] = useState<boolean>(job.direccion_validada_llegada);
  const [importe, setImporte] = useState<string>(String(job.importe ?? 0));
  const [precioLlegada, setPrecioLlegada] = useState<string>(String(job.precio_llegada ?? 0));
  const [motivo, setMotivo] = useState<string>(job.motivo_cancelacion ?? "");
  const [fecha, setFecha] = useState<string>(job.fecha);
  const [hora, setHora] = useState<string>(job.hora_programada ?? "");
  const [cliente, setCliente] = useState<string>(job.cliente ?? "");
  const [telefono, setTelefono] = useState<string>(job.telefono_cliente ?? "");
  const [tipoServicio, setTipoServicio] = useState<string>(job.tipo_servicio ?? "");
  const [empleadoId, setEmpleadoId] = useState<string>(job.empleado_id ?? job.user_id ?? "");
  const [direccion, setDireccion] = useState<string>(job.direccion ?? "");
  const [piso, setPiso] = useState<string>(job.piso ?? "");
  const [puerta, setPuerta] = useState<string>(job.puerta ?? "");
  const [codigoPostal, setCodigoPostal] = useState<string>(job.codigo_postal ?? "");
  const [ciudad, setCiudad] = useState<string>(job.ciudad ?? "Barcelona");
  const [observaciones, setObservaciones] = useState<string>(job.observaciones ?? "");
  const [saving, setSaving] = useState(false);

  const { data: empleados = [] } = useQuery({
    queryKey: ["empleados-list"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "empleado");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as { user_id: string; display_name: string | null; username: string | null }[];
      const { data } = await supabase.from("profiles").select("user_id, username, display_name").in("user_id", ids);
      return (data ?? []) as { user_id: string; display_name: string | null; username: string | null }[];
    },
  });

  // Anular
  const [anularOpen, setAnularOpen] = useState(false);
  const [motivoAnul, setMotivoAnul] = useState("");
  const [anulando, setAnulando] = useState(false);
  const isVoided = !!job.eliminado_logico;

  const cancelled = estado.startsWith("cancelado");

  async function save() {
    setSaving(true);
    try {
      const patch = {
        estado,
        direccion_validada_llegada: validada,
        importe: Number(importe) || 0,
        precio_llegada: Number(precioLlegada) || 0,
        motivo_cancelacion: cancelled ? (motivo || STATUS_LABELS[estado]) : null,
        fecha,
        hora_programada: hora || null,
        cliente: cliente.trim() || job.cliente,
        telefono_cliente: telefono.trim() || null,
        tipo_servicio: tipoServicio || null,
        empleado_id: empleadoId || job.empleado_id,
        user_id: empleadoId || job.user_id,
        direccion: direccion.trim() || job.direccion,
        piso: piso.trim() || null,
        puerta: puerta.trim() || null,
        codigo_postal: codigoPostal.trim() || null,
        ciudad: ciudad.trim() || null,
        observaciones: observaciones.trim() || null,
        hora_fin: estado === "realizado" && !job.hora_fin ? new Date().toISOString() : job.hora_fin,
      };
      const { error } = await supabase.from('servicios').update(patch).eq("id", job.id);
      if (error) throw error;
      toast.success("Servicio actualizado");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function anular() {
    if (!motivoAnul.trim()) { toast.error("Motivo obligatorio"); return; }
    setAnulando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const { error } = await supabase.from('servicios').update({
        eliminado_logico: true,
        motivo_anulacion: motivoAnul.trim(),
        anulado_por: uid,
        fecha_anulacion: new Date().toISOString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).eq("id", job.id);
      if (error) throw error;
      toast.success("Servicio anulado (no suma ganancia)");
      setAnularOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al anular");
    } finally { setAnulando(false); }
  }

  async function restaurar() {
    setAnulando(true);
    try {
      const { error } = await supabase.from('servicios').update({
        eliminado_logico: false,
        motivo_anulacion: null,
        anulado_por: null,
        fecha_anulacion: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).eq("id", job.id);
      if (error) throw error;
      toast.success("Servicio restaurado");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al restaurar");
    } finally { setAnulando(false); }
  }

  async function eliminarDefinitivo() {
    if (!confirm("⚠️ ELIMINAR DEFINITIVAMENTE este servicio? Esta acción es irreversible.")) return;
    setAnulando(true);
    try {
      const { error } = await supabase.from('servicios').delete().eq("id", job.id);
      if (error) throw error;
      toast.success("Servicio eliminado definitivamente");
      window.history.back();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    } finally { setAnulando(false); }
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-5 space-y-3">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-primary font-semibold">Admin — Actualizar servicio</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Edita servicios pasados sin GPS ni foto. Marca la llegada como validada para que el empleado cobre.
        </div>
      </div>

      {isVoided && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <div className="font-medium text-destructive">Servicio ANULADO</div>
          {job.motivo_anulacion && <div className="text-xs mt-1">Motivo: {job.motivo_anulacion}</div>}
          {job.fecha_anulacion && <div className="text-xs text-muted-foreground">Fecha: {new Date(job.fecha_anulacion).toLocaleString()}</div>}
          <div className="text-xs text-muted-foreground mt-1">No suma ganancia. Sigue visible en historial admin.</div>
        </div>
      )}

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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Hora programada</label>
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Empleado</label>
          <select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
            {empleados.map((emp) => (
              <option key={emp.user_id} value={emp.user_id}>{emp.display_name || emp.username}</option>
            ))}
            {!empleados.some((e) => e.user_id === empleadoId) && empleadoId && (
              <option value={empleadoId}>(actual)</option>
            )}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium">Tipo de servicio</label>
        <select value={tipoServicio} onChange={(e) => setTipoServicio(e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
          <option value="">—</option>
          {TIPO_SERVICIO_OPCIONES.map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Cliente</label>
          <input type="text" value={cliente} onChange={(e) => setCliente(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Teléfono</label>
          <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium">Dirección</label>
        <input type="text" value={direccion} onChange={(e) => setDireccion(e.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Piso</label>
          <input type="text" value={piso} onChange={(e) => setPiso(e.target.value)}
            placeholder="3º" className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Puerta</label>
          <input type="text" value={puerta} onChange={(e) => setPuerta(e.target.value)}
            placeholder="B" className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Código postal</label>
          <input type="text" value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)}
            placeholder="08001" className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Ciudad</label>
          <input type="text" value={ciudad} onChange={(e) => setCiudad(e.target.value)}
            placeholder="Barcelona" className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium">Observaciones</label>
        <Textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
      </div>

      <label className="flex items-start gap-2 rounded-md border bg-background p-3 text-sm cursor-pointer">
        <Checkbox checked={validada} onCheckedChange={(v) => setValidada(!!v)} className="mt-0.5" />
        <div>
          <div className="font-medium">Llegada validada (sin GPS)</div>
          <div className="text-xs text-muted-foreground">
            Aprobar manualmente la llegada. Necesario para que cobre el precio por llegada si el trabajo se canceló.
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

      <div className="border-t pt-3 space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-destructive font-semibold">Zona sensible</div>
        {!isVoided ? (
          <Dialog open={anularOpen} onOpenChange={setAnularOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full text-destructive border-destructive/40">
                Anular servicio (no suma ganancia)
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Anular servicio</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="rounded-md bg-muted p-2 text-xs">
                  Marca este servicio como <b>Anulado</b>. No sumará ganancia, desaparecerá de los pendientes del trabajador y quedará registrado con motivo y responsable.
                </div>
                <div>
                  <label className="text-xs font-medium">Motivo de anulación *</label>
                  <Textarea value={motivoAnul} onChange={(e) => setMotivoAnul(e.target.value)}
                    placeholder="Ej: Duplicado, creado por error, cliente inexistente..." rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAnularOpen(false)}>Volver</Button>
                <Button variant="destructive" onClick={anular} disabled={anulando || !motivoAnul.trim()}>
                  {anulando ? "Anulando..." : "Anular"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Button variant="outline" onClick={restaurar} disabled={anulando} className="w-full">
            {anulando ? "..." : "Restaurar servicio"}
          </Button>
        )}

        {isSuperAdmin && (
          <Button variant="destructive" onClick={eliminarDefinitivo} disabled={anulando} className="w-full">
            ⚠️ Eliminar definitivamente (Super Admin)
          </Button>
        )}
      </div>
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
