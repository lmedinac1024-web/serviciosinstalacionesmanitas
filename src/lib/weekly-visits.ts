import { isPaid, jobTotal, type Job } from "./jobs";

export type VisitDay = { date: string; jobs: Job[]; total: number };
export type VisitWeek = { start: string; end: string; days: VisitDay[]; count: number; total: number };

function iso(d: Date) { return d.toISOString().slice(0, 10); }

/** Calendar weeks Monday–Sunday, clipped to the selected month. */
export function buildWeeklyVisits(jobs: Job[], month: string): { weeks: VisitWeek[]; total: number; count: number } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { weeks: [], total: 0, count: 0 };
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const byDay = new Map<string, Job[]>();
  for (const job of jobs) {
    if (!isPaid(job) || job.fecha < `${month}-01` || job.fecha > `${month}-${last}`) continue;
    const group = byDay.get(job.fecha) ?? [];
    group.push(job);
    byDay.set(job.fecha, group);
  }
  const weeks: VisitWeek[] = [];
  let days: VisitDay[] = [];
  for (let n = 1; n <= last; n++) {
    const d = new Date(Date.UTC(year, m - 1, n));
    const date = iso(d);
    const rows = (byDay.get(date) ?? []).slice().sort((a, b) => (a.hora_programada ?? "99:99").localeCompare(b.hora_programada ?? "99:99") || a.cliente.localeCompare(b.cliente));
    days.push({ date, jobs: rows, total: rows.reduce((sum, j) => sum + jobTotal(j), 0) });
    if (d.getUTCDay() === 0 || n === last) {
      const first = days[0];
      if (first) weeks.push({ start: first.date, end: date, days, count: days.reduce((sum, day) => sum + day.jobs.length, 0), total: days.reduce((sum, day) => sum + day.total, 0) });
      days = [];
    }
  }
  return { weeks, total: weeks.reduce((sum, week) => sum + week.total, 0), count: weeks.reduce((sum, week) => sum + week.count, 0) };
}