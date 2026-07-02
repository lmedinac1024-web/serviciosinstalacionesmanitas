import { STATUS_LABELS, type JobStatus } from "@/lib/jobs";
import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  voided = false,
  className,
}: {
  status: JobStatus;
  voided?: boolean;
  className?: string;
}) {
  const cls = voided
    ? "bg-muted text-muted-foreground border-border line-through"
    : status === "pendiente"
      ? "bg-warning/15 text-warning-foreground border-warning/30"
      : status === "en_proceso"
        ? "bg-info/15 text-info border-info/30"
        : status === "realizado"
          ? "bg-success/15 text-success border-success/30"
          : "bg-destructive/15 text-destructive border-destructive/30";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        cls,
        className,
      )}
    >
      {voided ? "Anulado" : STATUS_LABELS[status]}
    </span>
  );
}
