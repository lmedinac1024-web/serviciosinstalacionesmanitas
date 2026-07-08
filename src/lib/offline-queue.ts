// IndexedDB-backed queue for offline job actions (Llegué / Finalizar / Cancelar).
// Photos are stored as Blobs. On reconnect, sync uploads photo and updates the row.

import { supabase } from "@/integrations/supabase/client";
import { sendJobUpdateToTelegram } from "@/lib/telegram.functions";

export type PendingKind = "inicio" | "final" | "cancelar";

export interface PendingAction {
  id: string;
  jobId: string;
  userId: string;
  kind: PendingKind;
  motivo?: string;             // for cancelar: `${estado}|${label}`
  destinoIds?: string[];
  photo?: Blob;                // required for inicio / final / cancelar (con foto)
  photoName?: string;
  arrivalLat?: number;
  arrivalLng?: number;
  arrivalDistanceM?: number | null;
  arrivalValidated?: boolean;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

const DB_NAME = "trabajos-offline";
const STORE = "pending_actions";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | Promise<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const r = run(store);
        if (r instanceof Promise) {
          r.then(resolve, reject);
          return;
        }
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

export async function enqueue(action: Omit<PendingAction, "id" | "createdAt" | "attempts">): Promise<PendingAction> {
  const full: PendingAction = {
    ...action,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    attempts: 0,
  };
  await tx("readwrite", (s) => s.add(full));
  notifyListeners();
  // Intento inmediato — si hay red se sube ya mismo sin esperar al banner.
  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    setTimeout(() => { void processQueue(); }, 50);
  }
  return full;
}

export async function listAll(): Promise<PendingAction[]> {
  return tx<PendingAction[]>("readonly", (s) => s.getAll() as IDBRequest<PendingAction[]>);
}

export async function listForJob(jobId: string): Promise<PendingAction[]> {
  const all = await listAll();
  return all.filter((a) => a.jobId === jobId);
}

export async function count(): Promise<number> {
  return tx<number>("readonly", (s) => s.count());
}

export async function remove(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
  notifyListeners();
}

async function update(action: PendingAction): Promise<void> {
  await tx("readwrite", (s) => s.put(action));
  notifyListeners();
}

// --- listeners for UI (pending count badge) ---
type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notifyListeners() {
  listeners.forEach((l) => {
    try { l(); } catch { /* noop */ }
  });
  // cross-tab sync via storage event
  try { localStorage.setItem("offline-queue-ping", String(Date.now())); } catch { /* noop */ }
}

// --- Processor ---
let syncing = false;

function photoExtension(blob: Blob): string {
  if (blob.type.includes("png")) return "png";
  if (blob.type.includes("webp")) return "webp";
  if (blob.type.includes("heic") || blob.type.includes("heif")) return "heic";
  return "jpg";
}

async function currentStorageUserId(fallbackUserId: string): Promise<string> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user?.id) return data.user.id;
  } catch {
    // Keep the queued user as a fallback for older offline entries.
  }
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.id) return data.session.user.id;
  } catch {
    // Keep the queued user as a fallback for older offline entries.
  }
  return fallbackUserId;
}

async function uploadPhoto(userId: string, jobId: string, fase: "inicio" | "final" | "cancel", blob: Blob, actionId?: string): Promise<string> {
  // Storage policies require the first folder to match the currently signed-in
  // user. Older queued actions could store the assigned employee id instead of
  // the signer id, which made sync fail after reconnect.
  const storageUserId = await currentStorageUserId(userId);
  const path = `${storageUserId}/${jobId}/${fase}-${actionId ?? Date.now()}.${photoExtension(blob)}`;
  const { error } = await supabase.storage
    .from("job-photos")
    .upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
  if (error) throw error;
  return `job-photos/${path}`;
}

async function notifyTelegram(action: PendingAction, fase: "inicio" | "final" | "cancel"): Promise<void> {
  const result = await sendJobUpdateToTelegram({
    data: {
      jobId: action.jobId,
      fase,
      ...(action.destinoIds && action.destinoIds.length > 0 ? { destinoIds: action.destinoIds } : {}),
    },
  });
  if (result.ok === false && !("skipped" in result && result.skipped)) {
    throw new Error("results" in result ? (result.results.find((r) => !r.ok)?.error ?? "No se pudo enviar el aviso") : "No se pudo enviar el aviso");
  }
}

async function notifyTelegramBestEffort(action: PendingAction, fase: "inicio" | "final" | "cancel"): Promise<void> {
  try {
    await notifyTelegram(action, fase);
  } catch (e) {
    // The database row and photo are the source of truth. A Telegram outage or
    // destination issue must not keep the offline action stuck forever.
    console.warn("[offline-queue] Telegram notification failed", e);
  }
}

async function processOne(action: PendingAction): Promise<void> {
  if (action.kind === "cancelar") {
    const [estado, ...labelParts] = (action.motivo ?? "cancelado_otro|Cancelado").split("|");
    const label = labelParts.join("|") || "Cancelado";
    type EstadoCancel = "cancelado_cliente" | "cancelado_direccion" | "cancelado_no_estaba" | "cancelado_otro";
    const statusPatch = {
      estado: estado as EstadoCancel,
      motivo_cancelacion: label,
      hora_fin: new Date().toISOString(),
      ...(action.arrivalLat != null ? { gps_cancelacion_lat: action.arrivalLat } : {}),
      ...(action.arrivalLng != null ? { gps_cancelacion_lng: action.arrivalLng } : {}),
    };
    const { error: statusError } = await supabase.from('servicios').update(statusPatch).eq("id", action.jobId);
    if (statusError) throw statusError;

    const photoPatch = {
      foto_cancelacion: null as string | null,
    };
    if (action.photo) {
      photoPatch.foto_cancelacion = await uploadPhoto(action.userId, action.jobId, "cancel", action.photo, action.id);
      const { error } = await supabase.from('servicios').update(photoPatch).eq("id", action.jobId);
      if (error) throw error;
    }
    await notifyTelegramBestEffort(action, "cancel");
    return;
  }

  const now = new Date().toISOString();
  if (action.kind === "inicio") {
    // NOTA: `direccion_validada_llegada` y `distancia_llegada_metros` solo pueden
    // modificarlos administradores (trigger guard_servicios_field_tamper), así que
    // no los enviamos desde el cliente empleado — se dejarían igual en la BD.
    const statusPatch = {
      hora_llegada: now,
      ...(action.arrivalLat != null ? { gps_llegada_lat: action.arrivalLat } : {}),
      ...(action.arrivalLng != null ? { gps_llegada_lng: action.arrivalLng } : {}),
    };
    const { error: statusMetaError } = await supabase.from("servicios").update(statusPatch).eq("id", action.jobId);
    if (statusMetaError) throw statusMetaError;

    // Do not revert an already finalized/cancelled service back to "en curso"
    // when an old start retry syncs later.
    const { error: statusError } = await supabase
      .from("servicios")
      .update({ estado: "en_proceso" as const })
      .eq("id", action.jobId)
      .eq("estado", "pendiente");
    if (statusError) throw statusError;

    if (action.photo) {
      const path = await uploadPhoto(action.userId, action.jobId, action.kind, action.photo, action.id);
      const { error } = await supabase.from("servicios").update({ foto_inicio: path }).eq("id", action.jobId);
      if (error) throw error;
    }
    await notifyTelegramBestEffort(action, "inicio");
    return;
  }


  const statusPatch = {
    estado: "realizado" as const,
    hora_fin: now,
    ...(action.arrivalLat != null ? { gps_final_lat: action.arrivalLat } : {}),
    ...(action.arrivalLng != null ? { gps_final_lng: action.arrivalLng } : {}),
  };
  const { error } = await supabase.from("servicios").update(statusPatch).eq("id", action.jobId);
  if (error) {
    const { error: startError } = await supabase
      .from("servicios")
      .update({ estado: "en_proceso" as const, hora_llegada: now })
      .eq("id", action.jobId)
      .eq("estado", "pendiente");
    if (startError) throw error;
    const { error: retryError } = await supabase.from("servicios").update(statusPatch).eq("id", action.jobId);
    if (retryError) throw retryError;
  }

  if (action.photo) {
    const path = await uploadPhoto(action.userId, action.jobId, action.kind, action.photo, action.id);
    const { error: photoError } = await supabase.from("servicios").update({ foto_final: path }).eq("id", action.jobId);
    if (photoError) throw photoError;
  }
  await notifyTelegramBestEffort(action, "final");

}

export async function processQueue(): Promise<{ ok: number; failed: number }> {
  if (syncing) return { ok: 0, failed: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: 0, failed: 0 };
  syncing = true;
  let ok = 0;
  let failed = 0;
  try {
    const items = (await listAll()).sort((a, b) => a.createdAt - b.createdAt);
    for (const item of items) {
      try {
        await processOne(item);
        await remove(item.id);
        ok++;
      } catch (e) {
        failed++;
        let msg: string;
        if (e instanceof Error) msg = e.message;
        else if (e && typeof e === "object") {
          const anyE = e as { message?: string; error?: string; hint?: string; details?: string; code?: string };
          msg = anyE.message || anyE.error || anyE.hint || anyE.details || anyE.code || JSON.stringify(e);
        } else msg = String(e);
        console.error("[offline-queue] action failed", item, e);
        await update({
          ...item,
          attempts: item.attempts + 1,
          lastError: msg,
        });
      }
    }
  } finally {
    syncing = false;
  }
  return { ok, failed };
}

// Auto-start listener (once)
let installed = false;
export function installAutoSync() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("online", () => { void processQueue(); });
  window.addEventListener("focus", () => { void processQueue(); });
  window.addEventListener("storage", (e) => {
    if (e.key === "offline-queue-ping") notifyListeners();
  });
  // initial pass shortly after load
  setTimeout(() => { void processQueue(); }, 1500);
}
