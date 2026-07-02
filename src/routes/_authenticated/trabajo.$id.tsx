import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Phone, MessageCircle, MapPin, CheckCircle2, XCircle, Camera, ImageIcon, User,
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
    queryKey: ["user-settings-default"],
    queryFn: async () => {
      const { data } = await supabase.from("user_settings").select("telegram_destino_default_id").maybeSingle();
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

  async function onPhotoSelected(fase: "inicio" | "final", file: File) {
    // si hay más de un destino y no hay default, pedir selección
    const hasDefault = !!userSettings?.telegram_destino_default_id;
    if (destinos.length > 1 && !hasDefault) {
      setPendingFile(file);
      setSelectedDest([]);
      setDestOpen(fase);
      return;
    }
    await savePhotoAndNotify(fase, file, []);
  }

  async function savePhotoAndNotify(fase: "inicio" | "final", file: File, destinoIds: string[]) {
    setWorking(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("No autenticado");

      if (!online) {
        // Encolar acción con foto persistente en IndexedDB
        await enqueueOffline({
          jobId: job!.id,
          userId,
          kind: fase,
          destinoIds,
          photo: file,
          photoName: file.name,
        });
        // Actualización optimista del cache
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
        const patch: Partial<Job> = fase === "inicio"
          ? { foto_inicio: path, estado: "en_proceso" }
          : { foto_final: path, estado: "realizado", finalizado_at: new Date().toISOString() };
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
                onClick={() => pickPhoto("inicio")}
                disabled={working || !online}
                title={!online ? "Necesitas conexión para iniciar" : undefined}
              >
                <Camera className="mr-2 h-5 w-5" /> Llegué — Foto de inicio
              </Button>
            )}
            {canFinish && (
              <Button
                size="lg"
                className="h-14 w-full bg-success text-success-foreground text-base hover:bg-success/90"
                onClick={() => pickPhoto("final")}
                disabled={working || !online}
                title={!online ? "Necesitas conexión para finalizar" : undefined}
              >
                <CheckCircle2 className="mr-2 h-5 w-5" /> Finalizar — Foto final
              </Button>
            )}
            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-12 w-full text-destructive" disabled={working || !online}>
                  <XCircle className="mr-2 h-4 w-4" /> Cancelar trabajo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Motivo de cancelación</DialogTitle></DialogHeader>
                <div className="space-y-2">
                  {CANCEL_REASONS.map((r) => (
                    <Button key={r.value} variant="outline" className="h-12 w-full justify-start"
                      onClick={() => cancelar(r.value)} disabled={working || !online}>
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
            <DialogHeader><DialogTitle>¿A quién enviar por Telegram?</DialogTitle></DialogHeader>
            <div className="space-y-2">
              {destinos.map((d) => (
                <label key={d.id} className="flex cursor-pointer items-center gap-3 rounded border p-3">
                  <Checkbox
                    checked={selectedDest.includes(d.id)}
                    onCheckedChange={(v) => setSelectedDest((s) => v ? [...s, d.id] : s.filter((x) => x !== d.id))}
                  />
                  <span>{d.nombre}</span>
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => destOpen && pendingFile && savePhotoAndNotify(destOpen, pendingFile, [])}>
                Guardar sin enviar
              </Button>
              <Button
                onClick={() => destOpen && pendingFile && savePhotoAndNotify(destOpen, pendingFile, selectedDest)}
                disabled={selectedDest.length === 0}
              >
                Enviar a {selectedDest.length || ""}
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

        <Button variant="ghost" onClick={() => navigate({ to: "/" })}>← Volver</Button>
      </div>
    </AppShell>
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
