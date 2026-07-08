import { Link } from "@tanstack/react-router";
import { Clock, MapPin, Phone, Briefcase } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatEUR, jobTotal, type Job } from "@/lib/jobs";

export function JobCard({ job }: { job: Job }) {
  return (
    <Link
      to="/trabajo/$id"
      params={{ id: job.id }}
      className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground">{job.hora_programada ?? "—"}</span>
            <span>·</span>
            <span>{job.fecha}</span>
          </div>
          <div className="mt-1 truncate text-base font-semibold">{job.cliente}</div>
          {job.tipo_servicio && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-primary">
              <Briefcase className="h-3 w-3" /> {job.tipo_servicio}
            </div>
          )}
          <div className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {[job.direccion, job.numero, job.codigo_postal, job.ciudad].filter(Boolean).join(", ")}
            </span>
          </div>
          {job.telefono_cliente && (
            <div className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              {job.telefono_cliente}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={job.estado} voided={!!job.eliminado_logico} />
          <div className="text-right">
            <div className="text-base font-bold">{formatEUR(jobTotal(job))}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}
