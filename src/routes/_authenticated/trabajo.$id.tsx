import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ChangeEvent } from "react";
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
  Phone, MessageCircle, MapPin, CheckCircle2, XCircle, Camera, ImageIcon, User, RotateCcw, Share2,
} from "lucide-react";
import {
  CANCEL_REASONS, STATUS_LABELS, TIPO_SERVICIO_OPCIONES, formatEUR, googleMapsUrl, isCancelled,
  jobTotal, telUrl, whatsappUrl, type Job, type JobStatus,
} from "@/lib/jobs";
import { useUserRole } from "@/hooks/useUserRole";
import { useOnline } from "@/hooks/useOnline";
import { enqueue as enqueueOffline } from "@/lib/offline-queue";

type Fase = "inicio" | "final" | "cancel";
type PhotoSource = "camera" | "gallery";

interface PendingShare {
  fase: Fase;
  file: File;
  title: string;
  text: string;
  previewUrl: string;
}

interface GpsMeta {
  lat: number;
  lng: number;
  distanceM: number | null;
  validated: boolean;
}

export const Route = createFileRoute("/_authenticated/trabajo/$id")({ component: Detalle });

async function uploadPhoto(jobId: string, fase: Fase, file: File, cachedUserId?: string) {
  let userId = cachedUserId;
  if (!userId) {
    const { data: userData } = await supabase.auth.getUser();
    userId = userData.user?.id;
  }
  if (!userId) throw new Error("No autenticado");
  const ext = file.type.includes("png")
    ? "png"
    : file.type.includes("webp")
      ? "webp"
      : file.type.includes("heic") || file.type.includes("heif")
        ? "heic"
        : "jpg";
  const path = `${userId}/${jobId}/${fase}-${Date.now()}.${ext}`;
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
  const startCameraInput = useRef<HTMLInputElement>(null);
  const startGalleryInput = useRef<HTMLInputElement>(null);
  const finalCameraInput = useRef<HTMLInputElement>(null);
  const finalGalleryInput = useRef<HTMLInputElement>(null);
  const cancelCameraInput = useRef<HTMLInputElement>(null);
  const cancelGalleryInput = useRef<HTMLInputElement>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [cancelExtra, setCancelExtra] = useState("");
  const [working, setWorking] = useState(false);
  const [photoPickerOpen, setPhotoPickerOpen] = useState<Fase | null>(null);
  const [gpsMeta, setGpsMeta] = useState<GpsMeta | null>(null);
  const [importeFinal, setImporteFinal] = useState<string>("");
  const [direccionFinal, setDireccionFinal] = useState<string>("");
  const [pisoFinal, setPisoFinal] = useState<string>("");
  const [puertaFinal, setPuertaFinal] = useState<string>("");
  const [pendingShare, setPendingShare] = useState<PendingShare | null>(null);
  const [sharing, setSharing] = useState(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ["jobs", id],
    queryFn: async () => {
      const { data, error } = await supabase.from('servicios').select("*").eq("id", id).single();
      if (error) throw error;
      return data as Job;
    },
    // Prevent focus refetch from reverting the optimistic status change while
    // the user is in the native share sheet (Telegram/WhatsApp).
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });


  const { data: empleado } = useQuery({
    queryKey: ["profile", job?.empleado_id],
    enabled: !!job?.empleado_id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("display_name, username").eq("user_id", job!.empleado_id!).maybeSingle();
      return data;
    },
  });

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


  function openPhotoPicker(fase: Fase) {
    setPhotoPickerOpen(fase);
  }

  function pickPhoto(fase: Fase, source: PhotoSource) {
    setPhotoPickerOpen(null);
    const input =
      fase === "inicio"
        ? source === "camera" ? startCameraInput.current : startGalleryInput.current
        : fase === "final"
          ? source === "camera" ? finalCameraInput.current : finalGalleryInput.current
          : source === "camera" ? cancelCameraInput.current : cancelGalleryInput.current;
    input?.click();
  }

  function handleFileInputChange(fase: Fase, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void onPhotoSelected(fase, file);
    e.target.value = "";
  }

  async function handleArrivalTap() {
    setGpsMeta(null);
    openPhotoPicker("inicio");
  }

  async function handleFinishTap() {
    setGpsMeta(null);
    openPhotoPicker("final");
  }

  async function handleCancelConfirm() {
    if (!cancelReason) { toast.error("Selecciona un motivo"); return; }
    setGpsMeta(null);
    setCancelOpen(false);
    openPhotoPicker("cancel");
  }

  function buildSharePayload(file: File, fase: Fase): Omit<PendingShare, "previewUrl"> {
    const faseTxt = fase === "inicio" ? "Foto de inicio" : fase === "final" ? "Foto final" : "Foto de cancelación";
    const header = `${faseTxt} — ${job?.cliente ?? ""}${job?.referencia ? ` · ${job.referencia}` : ""}`;
    const addressLine = fase !== "final" && direccionCompleta ? `📍 Dirección: ${direccionCompleta}` : "";
    let text = [header, addressLine].filter(Boolean).join("\n");
    if (fase === "cancel") {
      const reasonEntry = cancelReason ? CANCEL_REASONS.find((r) => r.label === cancelReason) ?? null : null;
      const motivo = [reasonEntry?.label ?? "Cancelado", cancelExtra.trim()].filter(Boolean).join(" — ");
      text = [header, addressLine, `❌ Motivo: ${motivo}`].filter(Boolean).join("\n");
    }
    return { fase, file, title: faseTxt, text };
  }

  async function shareFileNative(payload: Omit<PendingShare, "fase" | "previewUrl">): Promise<boolean> {
    try {
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
      if (!nav.share) {
        toast.info("Compartir nativo no disponible en este dispositivo");
        return false;
      }

      const shareFile = payload.file.type
        ? payload.file
        : new File([payload.file], payload.file.name || "foto-servicio.jpg", { type: "image/jpeg" });
      const variants: ShareData[] = [
        { files: [shareFile], title: payload.title, text: payload.text },
        { files: [shareFile], text: payload.text },
        { files: [shareFile], title: payload.title },
        { title: payload.title, text: payload.text },
      ];

      for (const data of variants) {
        if (data.files && nav.canShare && !nav.canShare(data)) continue;
        try {
          await nav.share(data);
          if (!data.files) toast.info("Tu móvil no permitió adjuntar la foto; se compartió el texto");
          return true;
        } catch (e) {
          const name = (e as DOMException)?.name;
          if (name === "AbortError" || name === "NotAllowedError") return false;
          if (name !== "TypeError") throw e;
        }
      }

      toast.info("Tu móvil no permite adjuntar esta foto; prueba con Galería");
      return false;
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") {
        toast.error("No se pudo abrir el menú compartir");
      }
      return false;
    }
  }

  function closePendingShare() {
    if (pendingShare?.previewUrl) URL.revokeObjectURL(pendingShare.previewUrl);
    setPendingShare(null);
  }

  async function sharePendingPhoto() {
    if (!pendingShare) return;
    setSharing(true);
    try {
      const ok = await shareFileNative(pendingShare);
      if (ok) closePendingShare();
    } finally {
      setSharing(false);
    }
  }

  function onPhotoSelected(fase: Fase, file: File) {
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

    const statusPatch: Partial<Job> =
      fase === "inicio"
        ? { estado: "en_proceso", hora_llegada: now }
        : fase === "final"
          ? { estado: "realizado", hora_fin: now }
          : { estado: nextEstado, hora_fin: now, motivo_cancelacion: motivoFinal };

    if (fase === "final" && me?.isAdmin) {
      if (importeFinal.trim() !== "") {
        const n = Number(importeFinal);
        if (!Number.isNaN(n) && n >= 0) statusPatch.importe = n;
      }
      if (direccionFinal.trim() !== "") statusPatch.direccion = direccionFinal.trim();
      if (pisoFinal.trim() !== "") statusPatch.piso = pisoFinal.trim();
      if (puertaFinal.trim() !== "") statusPatch.puerta = puertaFinal.trim();
    }

    const sharePayload = buildSharePayload(file, fase);
    const previewUrl = URL.createObjectURL(file);
    setPendingShare((old) => {
      if (old?.previewUrl) URL.revokeObjectURL(old.previewUrl);
      return { ...sharePayload, previewUrl };
    });

    // 1) UI advances instantly — never blocked by share or network.
    qc.setQueryData(["jobs", job!.id], (old: Job | undefined) =>
      old ? { ...old, ...statusPatch } : old,
    );
    toast.success(fase === "inicio" ? "Trabajo iniciado" : fase === "final" ? "Trabajo finalizado" : "Trabajo cancelado");
    if (fase === "cancel") { setCancelReason(null); setCancelExtra(""); }

    // 2) Try native share immediately; if the browser blocks it after camera/gallery,
    // the visible dialog keeps a real tap target to open Telegram/WhatsApp sharing.
    void shareFileNative(sharePayload).then((ok) => {
      if (ok) {
        setPendingShare((old) => {
          if (old?.previewUrl === previewUrl) URL.revokeObjectURL(old.previewUrl);
          return old?.previewUrl === previewUrl ? null : old;
        });
      }
    });

    // 3) Persist in background (status + photo). Never blocks UI.
    void persistInBackground(fase, file, statusPatch);
  }

  async function persistInBackground(fase: Fase, file: File, statusPatch: Partial<Job>) {
    const userId = me?.userId;
    const retryAction = userId
      ? {
          jobId: job!.id,
          userId,
          kind: fase === "cancel" ? "cancelar" as const : fase,
          destinoIds: [] as string[],
          photo: file,
          photoName: file.name,
          motivo:
            fase === "cancel" && statusPatch.motivo_cancelacion
              ? `${statusPatch.estado}|${statusPatch.motivo_cancelacion}`
              : undefined,
        }
      : null;

    try {
      const { error } = await supabase.from("servicios").update(statusPatch).eq("id", job!.id);
      if (error) {
        if (fase !== "final") throw error;
        // If the start update was paused while the native share sheet was open,
        // the row can still be pending. Move it to en curso first, then finish it.
        const { error: startError } = await supabase
          .from("servicios")
          .update({ estado: "en_proceso" as const, hora_llegada: job!.hora_llegada ?? new Date().toISOString() })
          .eq("id", job!.id)
          .eq("estado", "pendiente");
        if (startError) throw error;
        const { error: retryError } = await supabase.from("servicios").update(statusPatch).eq("id", job!.id);
        if (retryError) throw retryError;
      }
      void qc.invalidateQueries({ queryKey: ["jobs"] });
    } catch {
      if (retryAction) {
        await enqueueOffline(retryAction);
        toast.info("Sin conexión: guardado en cola");
      }
      return;
    }

    try {
      const path = await uploadPhoto(job!.id, fase, file, userId ?? undefined);
      const photoPatch: Partial<Job> =
        fase === "inicio"
          ? { foto_inicio: path }
          : fase === "final"
            ? { foto_final: path }
            : { foto_cancelacion: path };
      const { error } = await supabase.from("servicios").update(photoPatch).eq("id", job!.id);
      if (error) throw error;
      qc.setQueryData(["jobs", job!.id], (old: Job | undefined) =>
        old ? { ...old, ...photoPatch } : old,
      );
      void qc.invalidateQueries({ queryKey: ["jobs"] });
    } catch {
      if (retryAction) {
        await enqueueOffline(retryAction);
        toast.info("Foto pendiente de sincronizar");
      }
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
                disabled={working}
              >
                <Camera className="mr-2 h-5 w-5" /> Llegué — Foto de inicio
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
                  disabled={working}
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
                    Al continuar te pediremos una <b>foto obligatoria</b>. Después podrás compartirla desde el móvil. Este servicio <b>sí suma ganancia</b> (cancelado por trabajador).
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCancelOpen(false)}>Volver</Button>
                  <Button
                    variant="destructive"
                    onClick={handleCancelConfirm}
                    disabled={!cancelReason}>
                    Continuar y elegir foto
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {me?.isAdmin && !job.eliminado_logico && job.estado !== "pendiente" && (
          <Button
            variant="outline"
            className="h-11 w-full border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
            disabled={working}
            onClick={async () => {
              if (!confirm(`¿Revertir este servicio a "Pendiente"? Se limpiarán llegada, fin y validación GPS.`)) return;
              setWorking(true);
              try {
                const { error } = await supabase
                  .from("servicios")
                  .update({
                    estado: "pendiente",
                    hora_llegada: null,
                    hora_fin: null,
                    direccion_validada_llegada: false,
                    distancia_llegada_metros: null,
                    motivo_cancelacion: null,
                  })
                  .eq("id", job.id);
                if (error) throw error;
                toast.success("Servicio revertido a pendiente");
                qc.invalidateQueries({ queryKey: ["jobs"] });
                qc.invalidateQueries({ queryKey: ["job", job.id] });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Error al revertir");
              } finally {
                setWorking(false);
              }
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Revertir a pendiente (admin)
          </Button>
        )}

        <input ref={startCameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileInputChange("inicio", e)} />
        <input ref={startGalleryInput} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileInputChange("inicio", e)} />
        <input ref={finalCameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileInputChange("final", e)} />
        <input ref={finalGalleryInput} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileInputChange("final", e)} />
        <input ref={cancelCameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileInputChange("cancel", e)} />
        <input ref={cancelGalleryInput} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileInputChange("cancel", e)} />

        <Dialog open={!!photoPickerOpen} onOpenChange={(open) => { if (!open) setPhotoPickerOpen(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Seleccionar foto</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-28 flex-col gap-2"
                onClick={() => photoPickerOpen && pickPhoto(photoPickerOpen, "camera")}
              >
                <Camera className="h-7 w-7" />
                Cámara
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-28 flex-col gap-2"
                onClick={() => photoPickerOpen && pickPhoto(photoPickerOpen, "gallery")}
              >
                <ImageIcon className="h-7 w-7" />
                Galería
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Al guardar la foto se abrirá el compartir nativo para enviarla por Telegram, WhatsApp u otra app.
            </p>
          </DialogContent>
        </Dialog>

        <Dialog open={!!pendingShare} onOpenChange={(open) => { if (!open) closePendingShare(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Compartir foto</DialogTitle>
            </DialogHeader>
            {pendingShare && (
              <div className="space-y-3">
                <img
                  src={pendingShare.previewUrl}
                  alt="Foto seleccionada del servicio"
                  className="max-h-64 w-full rounded-lg border object-cover"
                />
                <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{pendingShare.text}</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={closePendingShare} disabled={sharing}>Continuar</Button>
                  <Button onClick={sharePendingPhoto} disabled={sharing}>
                    <Share2 className="mr-2 h-4 w-4" /> Compartir
                  </Button>
                </div>
              </div>
            )}
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
