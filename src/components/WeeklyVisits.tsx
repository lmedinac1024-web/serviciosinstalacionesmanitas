import { Link } from "@tanstack/react-router";
import { ChevronDown, Clock, MapPin } from "lucide-react";
import { formatEUR, displayStatus, jobTotal, type Job } from "@/lib/jobs";
import { buildWeeklyVisits } from "@/lib/weekly-visits";

function dateLabel(date: string, weekday = false) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("es-ES", { ...(weekday ? { weekday: "long" as const } : {}), day: "2-digit", month: "2-digit" });
}

export function WeeklyVisits({ jobs, month }: { jobs: Job[]; month: string }) {
  const report = buildWeeklyVisits(jobs, month);
  const tones = ["border-info bg-info/10 text-info", "border-success bg-success/10 text-success", "border-warning bg-warning/10 text-warning-foreground", "border-primary bg-primary/10 text-primary", "border-destructive bg-destructive/10 text-destructive"];
  return <section className="space-y-3" aria-label="Visitas por semana">
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Visitas por semana</h2>
    <div className="grid grid-cols-2 gap-3">
      <div className="border-l-4 border-info bg-info/10 p-4"><div className="text-xs text-muted-foreground">Servicios del mes</div><strong className="text-2xl text-info">{report.count}</strong></div>
      <div className="border-l-4 border-success bg-success/10 p-4"><div className="text-xs text-muted-foreground">Ganancias del mes</div><strong className="text-2xl text-success">{formatEUR(report.total)}</strong></div>
    </div>
    <div className="divide-y border-y">
      {report.weeks.map((week, i) => <details key={week.start} open className="group py-3">
        <summary className={`flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 border-l-4 p-3 text-sm ${tones[i % tones.length]}`}>
          <span className="flex items-center gap-2"><ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" /><span className="font-semibold">{week.weekNumber == null ? "Inicio de mes" : `Semana ${week.weekNumber}`} · {dateLabel(week.start)} – {dateLabel(week.end)}</span></span>
          <span className="flex items-center gap-3"><span className="text-xs">{week.count} servicios</span><strong className="tabular-nums">{formatEUR(week.total)}</strong></span>
        </summary>
        <div className="mt-3 divide-y">
          {week.days.map(day => <div key={day.date} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <h3 className="font-medium capitalize">{dateLabel(day.date, true)}</h3>
              <span className="flex items-center gap-3"><span className="text-xs text-info">{day.jobs.length} servicios</span><span className="font-semibold tabular-nums text-success">{formatEUR(day.total)}</span></span>
            </div>
            {day.jobs.length > 0 && <div className="mt-2 divide-y border-l-2 border-primary/20 pl-3">
              {day.jobs.map(job => <Link key={job.id} to="/trabajo/$id" params={{ id: job.id }} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 py-3 hover:bg-accent/40">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"><span className="inline-flex items-center gap-1 font-medium"><Clock className="h-3.5 w-3.5" />{job.hora_programada?.slice(0, 5) ?? "Sin hora"}</span><span className="break-words font-semibold">{job.cliente}</span></div>
                  <div className="flex items-start gap-1 text-xs text-muted-foreground"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="break-words">{job.direccion_completa || [job.direccion, job.numero, job.piso ? `Piso ${job.piso}` : "", job.puerta ? `Puerta ${job.puerta}` : "", job.codigo_postal, job.ciudad].filter(Boolean).join(", ")}</span></div>
                  <div className="text-xs text-muted-foreground">{displayStatus(job)}</div>
                </div>
                <strong className="text-sm tabular-nums text-success">{formatEUR(jobTotal(job))}</strong>
              </Link>)}
            </div>}
          </div>)}
        </div>
        <div className="flex items-center justify-between border-t py-3 text-sm font-semibold"><span>{week.weekNumber == null ? "Total inicio de mes" : `Total semana ${week.weekNumber}`}</span><span className="tabular-nums">{formatEUR(week.total)}</span></div>
      </details>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-success bg-success/10 p-4 font-bold"><span>Gran total del mes · {report.count} servicios</span><span className="text-xl tabular-nums text-success">{formatEUR(report.total)}</span></div>
  </section>;
}
