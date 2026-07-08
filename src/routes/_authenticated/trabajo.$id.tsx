import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
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
import { enqueue as enqueueOffline, listForJob, remove as removeOffline, subscribe as subscribeOffline } from "@/lib/offline-queue";
import { getCurrentPosition, haversineMeters } from "@/lib/geo";

type Fase = "inicio" | "final" | "cancel";
type PhotoSource = "camera" | "gallery";

interface SharePayload {
  fase: Fase;
  file: File;
  title: string;
  text: string;
  statusPatch: Partial<Job>;
}

type ShareResult = "file" | "text" | false;

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
  const [, setGpsMeta] = useState<GpsMeta | null>(null);
  const [importeFinal, setImporteFinal] = useState<string>("");
  const [direccionFinal, setDireccionFinal] = useState<string>("");
  const [pisoFinal, setPisoFinal] = useState<string>("");
  const [puertaFinal, setPuertaFinal] = useState<string>("");
  const [localPhotoUrls, setLocalPhotoUrls] = useState<Partial<Record<Fase, string>>>({});
  const localPhotoUrlsRef = useRef<Partial<Record<Fase, string>>>({});
  const [pendingShare, setPendingShare] = useState<Partial<Record<Fase, SharePayload>>>({});

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

  useEffect(() => {
    let alive = true;
    const applyQueuedState = async () => {
      const queued = await listForJob(id);
      if (!alive || queued.length === 0) return;

      const optimisticPatch = queued
        .sort((a, b) => a.createdAt - b.createdAt)
        .reduce<Partial<Job>>((patch, action) => {
          const at = new Date(action.createdAt).toISOString();
          if (action.kind === "inicio") {
            return { ...patch, estado: "en_proceso", hora_llegada: patch.hora_llegada ?? at };
          }
          if (action.kind === "final") {
            return { ...patch, estado: "realizado", hora_fin: at };
          }
          const [estado, ...motivoParts] = (action.motivo ?? "cancelado_otro|Cancelado").split("|");
          return {
            ...patch,
            estado: estado as JobStatus,
            hora_fin: at,
            motivo_cancelacion: motivoParts.join("|") || "Cancelado",
          };
        }, {});

      if (Object.keys(optimisticPatch).length > 0) {
        qc.setQueryData(["jobs", id], (old: Job | undefined) =>
          old ? { ...old, ...optimisticPatch } : old,
        );
      }
    };

    void applyQueuedState();
    const unsubscribe = subscribeOffline(() => { void applyQueuedState(); });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [id, qc, job?.id]);

  useEffect(() => () => {
    Object.values(localPhotoUrlsRef.current).forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
  }, []);


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


  function pickPhoto(fase: Fase, source: PhotoSource) {
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

  async function handleCancelConfirm(source: PhotoSource) {
    if (!cancelReason) { toast.error("Selecciona un motivo"); return; }
    setGpsMeta(null);
    setCancelOpen(false);
    pickPhoto("cancel", source);
  }

  function buildSharePayload(file: File, fase: Fase): Omit<SharePayload, "statusPatch"> {
    const faseTxt = fase === "inicio" ? "Foto de inicio" : fase === "final" ? "Foto final" : "Foto de cancelación";
    const header = `${faseTxt} — ${job?.cliente ?? ""}${job?.referencia ? ` · ${job.referencia}` : ""}`;
    const addressLine = direccionCompleta ? `📍 Dirección: ${direccionCompleta}` : "";
    let text = [header, addressLine].filter(Boolean).join("\n");
    if (fase === "cancel") {
      const reasonEntry = cancelReason ? CANCEL_REASONS.find((r) => r.label === cancelReason) ?? null : null;
      const motivo = [reasonEntry?.label ?? "Cancelado", cancelExtra.trim()].filter(Boolean).join(" — ");
      text = [header, addressLine, `❌ Motivo: ${motivo}`].filter(Boolean).join("\n");
    }
    return { fase, file, title: faseTxt, text };
  }

  async function shareFileNative(payload: Pick<SharePayload, "file" | "title" | "text">): Promise<ShareResult> {
    try {
      if (typeof navigator === "undefined") return false;
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
      if (!nav.share) {
        toast.info("Compartir nativo no disponible en este dispositivo");
        return false;
      }

      const fileName = /\.(jpe?g|png|webp|heic|heif)$/i.test(payload.file.name)
        ? payload.file.name
        : `foto-servicio-${Date.now()}.jpg`;
      const lowerName = fileName.toLowerCase();
      const inferredType = payload.file.type
        || (lowerName.endsWith(".png") ? "image/png"
          : lowerName.endsWith(".webp") ? "image/webp"
            : lowerName.endsWith(".heic") || lowerName.endsWith(".heif") ? "image/heic"
              : "image/jpeg");
      const shareFile = new File([payload.file], fileName, { type: inferredType });
      const variants: ShareData[] = [
        { files: [shareFile], title: payload.title, text: payload.text },
        { files: [shareFile], text: payload.text },
        { files: [shareFile], title: payload.title },
        { files: [shareFile] },
        { title: payload.title, text: payload.text },
      ];

      for (const data of variants) {
        try {
          await nav.share(data);
          if (!data.files) {
            toast.info("Tu móvil no permitió adjuntar la foto; se compartió la dirección");
            return "text";
          }
          return "file";
        } catch (e) {
          const name = (e as DOMException)?.name;
          if (name === "AbortError") return false;
          if (name !== "TypeError" && name !== "NotAllowedError") throw e;
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

  function buildStatusPatch(fase: Fase, at = new Date().toISOString()): Partial<Job> {
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
        ? { estado: "en_proceso", hora_llegada: at }
        : fase === "final"
          ? { estado: "realizado", hora_fin: at }
          : {
              estado: nextEstado,
              hora_fin: at,
              motivo_cancelacion: motivoFinal,
              // Al cancelar se cobra como servicio realizado; precio_llegada se iguala automáticamente al importe.
              precio_llegada: job!.importe,
            };

    if (fase === "final" && me?.isAdmin) {
      if (importeFinal.trim() !== "") {
        const n = Number(importeFinal);
        if (!Number.isNaN(n) && n >= 0) statusPatch.importe = n;
      }
      if (direccionFinal.trim() !== "") statusPatch.direccion = direccionFinal.trim();
      if (pisoFinal.trim() !== "") statusPatch.piso = pisoFinal.trim();
      if (puertaFinal.trim() !== "") statusPatch.puerta = puertaFinal.trim();
    }
    return statusPatch;
  }

  function onPhotoSelected(fase: Fase, file: File) {
    const statusPatch = buildStatusPatch(fase);
    const sharePayload: SharePayload = { ...buildSharePayload(file, fase), statusPatch };
    const localUrl = URL.createObjectURL(file);
    setLocalPhotoUrls((old) => {
      const previous = old[fase];
      if (previous) URL.revokeObjectURL(previous);
      const next = { ...old, [fase]: localUrl };
      localPhotoUrlsRef.current = next;
      return next;
    });
    setPendingShare((old) => ({ ...old, [fase]: sharePayload }));
    toast.success(
      fase === "inicio"
        ? "Foto de inicio lista. Toca Compartir y marcar llegada."
        : fase === "final"
          ? "Foto final lista. Toca Compartir y finalizar tarea."
          : "Foto de cancelación lista. Toca Compartir y cancelar."
    );
  }

  function patchJobInCaches(statusPatch: Partial<Job>) {
    const terminal = statusPatch.estado === "realizado" || (statusPatch.estado ? isCancelled(statusPatch.estado) : false);
    qc.setQueryData(["jobs", job!.id], (old: Job | undefined) =>
      old ? { ...old, ...statusPatch } : old,
    );

    qc.getQueryCache().findAll({ queryKey: ["jobs", "lista"] }).forEach((query) => {
      const key = query.queryKey as readonly unknown[];
      const filtro = key[2];
      qc.setQueryData(query.queryKey, (old: Job[] | undefined) => {
        if (!old) return old;
        if (filtro === "pendientes" && terminal) {
          return old.filter((item) => item.id !== job!.id);
        }
        return old.map((item) => (item.id === job!.id ? { ...item, ...statusPatch } : item));
      });
    });
  }

  async function buildGpsPatch(fase: Fase): Promise<Partial<Job>> {
    try {
      const pos = await getCurrentPosition();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const hasTarget = job!.direccion_lat != null && job!.direccion_lng != null;
      const distanceM = hasTarget
        ? haversineMeters({ lat, lng }, { lat: Number(job!.direccion_lat), lng: Number(job!.direccion_lng) })
        : null;
      const validated = distanceM != null ? distanceM <= 250 : false;
      setGpsMeta({ lat, lng, distanceM, validated });
      if (fase === "inicio") {
        return {
          gps_llegada_lat: lat,
          gps_llegada_lng: lng,
          distancia_llegada_metros: distanceM,
          direccion_validada_llegada: validated,
        };
      }
      if (fase === "final") return { gps_final_lat: lat, gps_final_lng: lng };
      return { gps_cancelacion_lat: lat, gps_cancelacion_lng: lng };
    } catch {
      return {};
    }
  }

  async function completePhotoAction(payload: SharePayload) {
    if (working) return;
    setWorking(true);

    // Invocar el compartir nativo inmediatamente desde el toque del usuario,
    // pero NO esperar a que Telegram/WhatsApp cierre. En varios móviles la
    // promesa de navigator.share puede tardar o no resolver hasta volver a la
    // app; el servicio debe avanzar igual para no dejar al trabajador pegado.
    const sharePromise = shareFileNative(payload);

    try {
      const gpsPatch = await buildGpsPatch(payload.fase);
      const statusPatch = { ...payload.statusPatch, ...gpsPatch };
      const payloadWithGps = { ...payload, statusPatch };

      // Cambiar estado YA (llegada / realizado / cancelado). El envío de la foto
      // y la subida a Supabase quedan desacoplados para que la calle sea ágil.
      patchJobInCaches(statusPatch);
      setPendingShare((old) => {
        const next = { ...old };
        delete next[payload.fase];
        return next;
      });
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      toast.success(
        (payload.fase === "inicio" ? "Llegada marcada" : payload.fase === "final" ? "Tarea realizada" : "Tarea cancelada") +
        (offline ? " · en cola offline" : "")
      );
      if (payload.fase === "cancel") { setCancelReason(null); setCancelExtra(""); }

      void sharePromise.then((shareResult) => {
        if (!shareResult) toast.info("Si no se envió, compártela manualmente; el estado ya quedó guardado");
      });

      // Persistir en background
      const persistPromise = persistInBackground(payloadWithGps.fase, payloadWithGps.file, payloadWithGps.statusPatch);

      // Si es final o cancelación, asegurar estado terminal antes de volver.
      // La foto puede quedarse subiendo en cola, pero el estado debe cambiar ya.
      if (payload.fase === "final" || payload.fase === "cancel") {
        if (typeof navigator === "undefined" || navigator.onLine !== false) {
          try {
            await persistStatusPatch(payloadWithGps.fase, payloadWithGps.statusPatch);
            patchJobInCaches(payloadWithGps.statusPatch);
          } catch (e) {
            toast.info("No se pudo confirmar al momento; queda en cola y se sincroniza automático");
          }
        }
        void persistPromise.catch(() => undefined);
        // Nos quedamos en la ficha para que el trabajador vea la confirmación
        // y la foto local; ya no saltamos a /pendientes automáticamente.
      }
    } finally {

      setWorking(false);
    }
  }


  async function iniciarTareaDirecta() {
    if (working) return;
    setWorking(true);
    const at = new Date().toISOString();
    const header = `Iniciando tarea — ${job!.cliente ?? ""}${job!.referencia ? ` · ${job!.referencia}` : ""}`;
    const tipoLine = job!.tipo_servicio ? `🛠️ Incidencia: ${job!.tipo_servicio}` : "";
    const addressLine = direccionCompleta ? `📍 Dirección: ${direccionCompleta}` : "";
    const mapsLine = `🗺️ ${googleMapsUrl(job!)}`;
    const text = [header, tipoLine, addressLine, mapsLine].filter(Boolean).join("\n");

    // Disparar compartir nativo desde el gesto del usuario, sin bloquear
    const sharePromise = (async () => {
      try {
        if (typeof navigator === "undefined") return false;
        const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
        if (!nav.share) return false;
        await nav.share({ title: "Iniciar tarea", text });
        return true;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return false;
        return false;
      }
    })();

    try {
      const gpsPatch = await buildGpsPatch("inicio");
      const statusPatch: Partial<Job> = { estado: "en_proceso", hora_llegada: at, ...gpsPatch };
      // UI optimista siempre
      patchJobInCaches(statusPatch);
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      toast.success("Tarea iniciada" + (offline ? " · en cola offline" : ""));
      void sharePromise;

      // Encolar SIEMPRE para que sobreviva sin internet o sin sesión.
      const userId = me?.userId ?? job?.empleado_id ?? job?.user_id ?? undefined;
      let queuedId: string | null = null;
      if (userId) {
        try {
          const queued = await enqueueOffline({
            jobId: job!.id,
            userId,
            kind: "inicio",
            destinoIds: [],
            arrivalLat: typeof statusPatch.gps_llegada_lat === "number" ? statusPatch.gps_llegada_lat : undefined,
            arrivalLng: typeof statusPatch.gps_llegada_lng === "number" ? statusPatch.gps_llegada_lng : undefined,
            arrivalDistanceM: typeof statusPatch.distancia_llegada_metros === "number" ? statusPatch.distancia_llegada_metros : null,
            arrivalValidated: typeof statusPatch.direccion_validada_llegada === "boolean" ? statusPatch.direccion_validada_llegada : undefined,
          });
          queuedId = queued.id;
        } catch { /* si falla la cola seguimos con persistencia directa */ }
      }

      if (!offline) {
        try {
          await persistStatusPatch("inicio", statusPatch);
          patchJobInCaches(statusPatch);
          if (queuedId) await removeOffline(queuedId);
        } catch {
          toast.info("Sin conexión estable; se sincroniza automáticamente");
        }
      }
    } finally {
      setWorking(false);
    }
  }

  async function persistStatusPatch(fase: Fase, statusPatch: Partial<Job>) {
    const { error } = await supabase.from("servicios").update(statusPatch).eq("id", job!.id);
    if (!error) return;

    if (fase !== "final") throw error;
    const { error: startError } = await supabase
      .from("servicios")
      .update({ estado: "en_proceso" as const, hora_llegada: job!.hora_llegada ?? new Date().toISOString() })
      .eq("id", job!.id)
      .eq("estado", "pendiente");
    if (startError) throw error;

    const { error: retryError } = await supabase.from("servicios").update(statusPatch).eq("id", job!.id);
    if (retryError) throw retryError;
  }


  async function persistInBackground(fase: Fase, file: File, statusPatch: Partial<Job>) {
    const userId = me?.userId ?? job?.empleado_id ?? job?.user_id ?? undefined;
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
          arrivalLat:
            fase === "inicio" ? (typeof statusPatch.gps_llegada_lat === "number" ? statusPatch.gps_llegada_lat : undefined)
            : fase === "final" ? (typeof statusPatch.gps_final_lat === "number" ? statusPatch.gps_final_lat : undefined)
            : typeof statusPatch.gps_cancelacion_lat === "number" ? statusPatch.gps_cancelacion_lat : undefined,
          arrivalLng:
            fase === "inicio" ? (typeof statusPatch.gps_llegada_lng === "number" ? statusPatch.gps_llegada_lng : undefined)
            : fase === "final" ? (typeof statusPatch.gps_final_lng === "number" ? statusPatch.gps_final_lng : undefined)
            : typeof statusPatch.gps_cancelacion_lng === "number" ? statusPatch.gps_cancelacion_lng : undefined,
          arrivalDistanceM: typeof statusPatch.distancia_llegada_metros === "number" ? statusPatch.distancia_llegada_metros : null,
          arrivalValidated: typeof statusPatch.direccion_validada_llegada === "boolean" ? statusPatch.direccion_validada_llegada : undefined,
        }
      : null;

    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    let queuedId: string | null = null;
    let statusPersisted = false;

    if (retryAction) {
      try {
        const queued = await enqueueOffline(retryAction);
        queuedId = queued.id;
        if (offline) {
          toast.info("Sin conexión: guardado en cola");
        }
      } catch {
        if (offline) {
          toast.error("No se pudo guardar en cola offline");
          return;
        }
      }
    }

    if (!offline) {
      try {
        await persistStatusPatch(fase, statusPatch);
        patchJobInCaches(statusPatch);
        statusPersisted = true;
      } catch {
        // If the immediate status update cannot finish, the queued action below
        // will retry it automatically. The UI already moved forward.
      }
    }

    if (offline) return;

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
      if (queuedId && statusPersisted) await removeOffline(queuedId);
      if (queuedId && !statusPersisted) toast.info("Estado pendiente de sincronizar");
      void qc.invalidateQueries({ queryKey: ["jobs"] });
    } catch {
      if (retryAction) toast.info("Foto pendiente de sincronizar");
    }
  }

  const canStart = job.estado === "pendiente";
  const canFinish = job.estado === "en_proceso";
  const isDone = job.estado === "realizado" || isCancelled(job.estado);

  const calleNumero = [job.direccion, job.numero].filter(Boolean).join(", ").trim();
  const direccionCompleta = [job.direccion, job.numero, job.codigo_postal, job.ciudad].filter(Boolean).join(", ");
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
              <div>{calleNumero || job.direccion}</div>
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
                onClick={() => { void iniciarTareaDirecta(); }}
                disabled={working}
              >
                <Share2 className="mr-2 h-5 w-5" /> Iniciar Tarea — Compartir dirección
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
                  onClick={() => pickPhoto("final", "camera")}
                  disabled={working}
                >
                  <CheckCircle2 className="mr-2 h-5 w-5" /> Finalizar tarea
                  {!online && <span className="ml-2 text-xs opacity-80">(offline)</span>}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => pickPhoto("final", "gallery")}
                  disabled={working}
                >
                  <ImageIcon className="mr-2 h-4 w-4" /> Elegir desde galería
                </Button>
              </>
            )}
            <Dialog open={cancelOpen} onOpenChange={(v) => { setCancelOpen(v); if (v) { setCancelReason(null); setCancelExtra(""); } }}>
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
                    Al continuar te pediremos una <b>foto obligatoria</b>. Después podrás compartirla desde el móvil.
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setCancelOpen(false); setCancelReason(null); setCancelExtra(""); }}>Volver</Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleCancelConfirm("camera")}
                    disabled={!cancelReason}>
                    Cámara
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleCancelConfirm("gallery")}
                    disabled={!cancelReason}>
                    Galería
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {(pendingShare.inicio || pendingShare.final || pendingShare.cancel) && (
          <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
            {(["inicio", "final", "cancel"] as Fase[]).map((f) => {
              const p = pendingShare[f];
              if (!p) return null;
              const label =
                f === "inicio"
                  ? "Compartir dirección + foto (marcar llegada)"
                  : f === "final"
                    ? "Compartir foto final + dirección (finalizar)"
                    : "Compartir foto + dirección (cancelar)";
              return (
                <Button
                  key={f}
                  size="lg"
                  className="h-14 w-full text-base"
                  onClick={() => { void completePhotoAction(p); }}
                  disabled={working}
                >
                  <Share2 className="mr-2 h-5 w-5" /> {working ? "Abriendo compartir..." : label}
                </Button>
              );
            })}
            <div className="text-xs text-muted-foreground">
              Se comparte la dirección con la foto y el servicio pasa al siguiente estado.
            </div>

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
          <PhotoBox title="Foto inicio" url={fotoInicioUrl ?? localPhotoUrls.inicio} />
          <PhotoBox title="Foto final" url={fotoFinalUrl ?? localPhotoUrls.final} />
          <PhotoBox title="Foto cancel." url={fotoCancelUrl ?? localPhotoUrls.cancel} />
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
      const importeNum = Number(importe) || 0;
      const patch = {
        estado,
        direccion_validada_llegada: validada,
        importe: importeNum,
        // Al cancelar se cobra como servicio realizado: precio_llegada = importe automáticamente.
        precio_llegada: cancelled ? importeNum : Number(precioLlegada) || 0,
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
        {!cancelled && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Precio por llegada (€)</label>
            <input type="number" step="0.01" min="0" value={precioLlegada} onChange={(e) => setPrecioLlegada(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
          </div>
        )}
        {cancelled && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Cobro por cancelación (€)</label>
            <div className="flex h-[34px] items-center rounded-md border bg-muted px-2 text-sm text-muted-foreground">
              Igual al importe
            </div>
          </div>
        )}
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
            Aprobar manualmente la llegada. Necesario para que cobre el servicio si se canceló por algún motivo.
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
