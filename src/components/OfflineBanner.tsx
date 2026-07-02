import { WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/useOnline";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-destructive px-3 py-1.5 text-center text-xs font-medium text-destructive-foreground"
    >
      <WifiOff className="h-3.5 w-3.5" />
      Sin conexión — las acciones que guardan datos están deshabilitadas
    </div>
  );
}
