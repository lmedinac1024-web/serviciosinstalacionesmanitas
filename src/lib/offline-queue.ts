// IndexedDB-backed queue for offline job actions (Llegué / Finalizar / Cancelar).
// Photos are stored as Blobs. On reconnect, sync uploads photo, updates row and notifies Telegram.

import { supabase } from "@/integrations/supabase/client";

export type PendingKind = "inicio" | "final" | "cancelar";

export interface PendingAction {
  id: string;
  jobId: string;
  userId: string;
  kind: PendingKind;
  motivo?: string;             // for cancelar
  destinoIds?: string[];       // telegram destinos (may be empty)
  photo?: Blob;                // required for inicio / final
  photoName?: string;
  arrivalLat?: number;         // for kind='inicio': coords captured on tap
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

async function remove(id: string): Promise<void> {
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

async function uploadPhoto(userId: string, jobId: string, fase: "inicio" | "final", blob: Blob): Promise<string> {
  const path = `${userId}/${jobId}/${fase}-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("job-photos")
    .upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
  if (error) throw error;
  return `job-photos/${path}`;
}

async function processOne(action: PendingAction): Promise<void> {
  if (action.kind === "cancelar") {
    const { error } = await supabase
      .from("jobs")
      .update({ estado: "no_paga" as never, motivo_cancelacion: action.motivo ?? "Cancelado" })
      .eq("id", action.jobId);
    if (error) throw error;
    // For cancel we use whatever motivo enum the caller enqueued as "estado". Handled by caller instead.
    return;
  }

  if (!action.photo) throw new Error("Foto no encontrada en cola");
  const path = await uploadPhoto(action.userId, action.jobId, action.kind, action.photo);
  const patch = action.kind === "inicio"
    ? {
        foto_inicio: path,
        estado: "en_proceso" as const,
        llegada_lat: action.arrivalLat ?? null,
        llegada_lng: action.arrivalLng ?? null,
        llegada_distancia_m: action.arrivalDistanceM ?? null,
        llegada_validada: action.arrivalValidated ?? false,
      }
    : { foto_final: path, estado: "realizado" as const, finalizado_at: new Date().toISOString() };
  const { error } = await supabase.from("jobs").update(patch).eq("id", action.jobId);
  if (error) throw error;

  // Fire-and-forget Telegram (server fn). We import lazily to avoid circular deps.
  try {
    const { sendJobUpdateToTelegram } = await import("@/lib/telegram.functions");
    await sendJobUpdateToTelegram({
      data: { jobId: action.jobId, fase: action.kind, destinoIds: action.destinoIds ?? [] },
    });
  } catch {
    // Telegram failure should not block sync
  }
}

// Handle cancelar separately so we can pass the exact estado enum without changing PendingAction shape.
// The caller stores the estado value in `motivo` when kind==='cancelar' via a small convention:
// motivo = `${estado}|${label}` e.g. "no_paga|No paga"
async function processCancel(action: PendingAction): Promise<void> {
  const [estado, ...labelParts] = (action.motivo ?? "no_paga|Cancelado").split("|");
  const label = labelParts.join("|") || "Cancelado";
  const { error } = await supabase
    .from("jobs")
    .update({ estado: estado as never, motivo_cancelacion: label })
    .eq("id", action.jobId);
  if (error) throw error;
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
        if (item.kind === "cancelar") await processCancel(item);
        else await processOne(item);
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
