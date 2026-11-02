import { buildWeeklyVisits } from "./weekly-visits";
import { displayStatus, formatEUR, jobTotal, type Job } from "./jobs";

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "2-digit" });

export function dashboardPrintBody(jobs: Job[], month: string, employee: string): string {
  const report = buildWeeklyVisits(jobs, month);
  return `<h1>ServiHogar · Dashboard mensual</h1><p>${escape(employee)} · ${escape(month)}</p>
    <h2>${report.count} servicios · ${escape(formatEUR(report.total))}</h2>
    ${report.weeks.map((week, index) => `<section><h2 class="tone-${index % 5}">${week.weekNumber == null ? "Inicio de mes" : `Semana ${week.weekNumber}`} · ${date(week.start)} — ${date(week.end)} · ${week.count} servicios · ${escape(formatEUR(week.total))}</h2>
      ${week.days.map(day => `<h3>${date(day.date)} · ${day.jobs.length} servicios · ${escape(formatEUR(day.total))}</h3>
        ${day.jobs.length ? `<table><thead><tr><th>Hora</th><th>Asegurado</th><th>Dirección</th><th>Estado</th><th>Valor</th></tr></thead><tbody>${day.jobs.map(job => `<tr><td>${escape(job.hora_programada?.slice(0, 5) ?? "Sin hora")}</td><td>${escape(job.cliente)}</td><td>${escape(job.direccion_completa || [job.direccion, job.numero, job.piso ? `Piso ${job.piso}` : "", job.puerta ? `Puerta ${job.puerta}` : "", job.codigo_postal, job.ciudad].filter(Boolean).join(", "))}</td><td>${escape(displayStatus(job))}</td><td class="amount">${escape(formatEUR(jobTotal(job)))}</td></tr>`).join("")}</tbody></table>` : ""}`).join("")}
      <h3>Total ${week.weekNumber == null ? "inicio de mes" : `semana ${week.weekNumber}`}: ${escape(formatEUR(week.total))}</h3></section>`).join("")}
    <h2>Gran total del mes · ${report.count} servicios · ${escape(formatEUR(report.total))}</h2>`;
}

export function printDashboard(jobs: Job[], month: string, employee: string): boolean {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  popup.opener = null;
  const tokens = getComputedStyle(document.documentElement);
  const variables = ["card", "foreground", "border", "info", "success", "warning", "primary", "destructive"].map(name => `--${name}:${tokens.getPropertyValue(`--${name}`)};`).join("");
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Dashboard ${escape(month)} · ${escape(employee)}</title><style>
    :root{${variables}} body{font-family:Arial,sans-serif;background:var(--card);color:var(--foreground);margin:24px;font-size:12px;print-color-adjust:exact;-webkit-print-color-adjust:exact}h1{font-size:22px}h2{font-size:15px;padding:8px 0}h3{font-size:12px;margin:12px 0 6px}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{padding:6px;border-bottom:1px solid var(--border);text-align:left;overflow-wrap:anywhere}th:first-child{width:9%}th:last-child{width:13%}.amount{text-align:right;white-space:nowrap}tr,h2,h3{break-inside:avoid}h3{break-after:avoid}.tone-0{border-left:4px solid var(--info)}.tone-1{border-left:4px solid var(--success)}.tone-2{border-left:4px solid var(--warning)}.tone-3{border-left:4px solid var(--primary)}.tone-4{border-left:4px solid var(--destructive)}section>h2{padding-left:8px}@page{size:A4;margin:12mm}@media print{body{margin:0}}
    </style></head><body>${dashboardPrintBody(jobs, month, employee)}</body></html>`);
  popup.document.close();
  popup.focus();
  popup.setTimeout(() => popup.print(), 250);
  return true;
}