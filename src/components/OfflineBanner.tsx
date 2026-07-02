import { WifiOff, CloudUpload, Loader2 } from "lucide-react";
import { useOnline } from "@/hooks/useOnline";
import { usePendingQueue } from "@/hooks/usePendingQueue";
import { useState } from "react";

export function OfflineBanner() {
  const online = useOnline();
  const { pending, sync } = usePendingQueue();
  const [syncing, setSyncing] = useState(false);

  if (online && pending === 0) return null;

  if (!online) {
    return (
      <div
        role="status"
        className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-destructive px-3 py-1.5 text-center text-xs font-medium text-destructive-foreground"
      >
        <WifiOff className="h-3.5 w-3.5" />
        Sin conexión
        {pending > 0 && <span className="ml-1 rounded bg-black/20 px-1.5 py-0.5">{pending} en cola</span>}
      </div>
    );
  }

  // Online + pending
  return (
    <button
      onClick={async () => { setSyncing(true); try { await sync(); } finally { setSyncing(false); } }}
      className="sticky top-0 z-40 flex w-full items-center justify-center gap-2 bg-primary px-3 py-1.5 text-center text-xs font-medium text-primary-foreground hover:bg-primary/90"
    >
      {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
      {syncing ? "Sincronizando…" : `Sincronizar ${pending} acción${pending === 1 ? "" : "es"} pendiente${pending === 1 ? "" : "s"}`}
    </button>
  );
}
