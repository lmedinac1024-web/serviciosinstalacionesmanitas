import { useEffect, useState } from "react";
import { count, subscribe, installAutoSync, processQueue } from "@/lib/offline-queue";

export function usePendingQueue() {
  const [n, setN] = useState(0);
  useEffect(() => {
    installAutoSync();
    let alive = true;
    const refresh = () => { count().then((c) => { if (alive) setN(c); }).catch(() => {}); };
    refresh();
    const unsub = subscribe(refresh);
    return () => { alive = false; unsub(); };
  }, []);
  return { pending: n, sync: processQueue };
}
