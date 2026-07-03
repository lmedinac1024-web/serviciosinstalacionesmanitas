// IndexedDB-backed queue for offline job actions (Llegué / Finalizar / Cancelar).
// Photos are stored as Blobs. On reconnect, sync uploads photo and updates the row.

import { supabase } from "@/integrations/supabase/client";

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

async function uploadPhoto(userId: string, jobId: string, fase: "inicio" | "final" | "cancel", blob: Blob): Promise<string> {
  const path = `${userId}/${jobId}/${fase}-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("job-photos")
    .upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
  if (error) throw error;
  return `job-photos/${path}`;
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
      photoPatch.foto_cancelacion = await uploadPhoto(action.userId, action.jobId, "cancel", action.photo);
      const { error } = await supabase.from('servicios').update(photoPatch).eq("id", action.jobId);
      if (error) throw error;
    }
    return;
  }

  if (!action.photo) throw new Error("Foto no encontrada en cola");
  const now = new Date().toISOString();
  if (action.kind === "inicio") {
    const statusPatch = {
      hora_llegada: now,
      ...(action.arrivalLat != null ? { gps_llegada_lat: action.arrivalLat } : {}),
      ...(action.arrivalLng != null ? { gps_llegada_lng: action.arrivalLng } : {}),
    };
    const { error: statusMetaError } = await supabase.from("servicios").update(statusPatch).eq("id", action.jobId);
    if (statusMetaError) throw statusMetaError;

    // Do not revert an already finalized/cancelled service back to "en curso"
    // when an old start-photo retry syncs later.
    const { error: statusError } = await supabase
      .from("servicios")
      .update({ estado: "en_proceso" as const })
      .eq("id", action.jobId)
      .eq("estado", "pendiente");
    if (statusError) throw statusError;

    const path = await uploadPhoto(action.userId, action.jobId, action.kind, action.photo);
    const { error } = await supabase.from("servicios").update({ foto_inicio: path }).eq("id", action.jobId);
    if (error) throw error;
    return;
  }

  const statusPatch = {
    estado: "realizado" as const,
    hora_fin: now,
    ...(action.arrivalLat != null ? { gps_final_lat: action.arrivalLat } : {}),
    ...(action.arrivalLng != null ? { gps_final_lng: action.arrivalLng } : {}),
  };
  const { error } = await supabase.from("servicios").update(statusPatch).eq("id", action.jobId);
  if (!error) return;

  await supabase
    .from("servicios")
    .update({ estado: "en_proceso" as const, hora_llegada: now })
    .eq("id", action.jobId)
    .eq("estado", "pendiente");
  const { error: retryError } = await supabase.from("servicios").update(statusPatch).eq("id", action.jobId);
  if (retryError) throw retryError;

  const path = await uploadPhoto(action.userId, action.jobId, action.kind, action.photo);
  const { error: photoError } = await supabase.from("servicios").update({ foto_final: path }).eq("id", action.jobId);
  if (photoError) throw photoError;

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
        await update({
          ...item,
          attempts: item.attempts + 1,
          lastError: e instanceof Error ? e.message : String(e),
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
