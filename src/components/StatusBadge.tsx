import { STATUS_LABELS, statusColorClass, type JobStatus } from "@/lib/jobs";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        statusColorClass(status),
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
