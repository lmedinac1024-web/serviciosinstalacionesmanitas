/// <reference types="bun" />
import { expect, test } from "bun:test";
import { buildWeeklyVisits } from "./weekly-visits";
import type { Job } from "./jobs";

function job(fecha: string, importe: number, estado: Job["estado"] = "realizado", extra: Partial<Job> = {}): Job {
  return { id: `${fecha}-${importe}`, fecha, importe, estado, eliminado_logico: false, ganancia: null, cliente: "Asegurado", hora_programada: "10:00", ...extra } as Job;
}
test("semanas lunes a domingo y bordes del mes sin incluir otro mes", () => {
  const result = buildWeeklyVisits([job("2026-09-30", 90), job("2026-10-01", 10), job("2026-10-04", 20), job("2026-10-05", 15), job("2026-10-31", 5), job("2026-11-01", 100)], "2026-10");
  expect(result.weeks.map(w => [w.start, w.end])).toEqual([["2026-10-01", "2026-10-04"], ["2026-10-05", "2026-10-11"], ["2026-10-12", "2026-10-18"], ["2026-10-19", "2026-10-25"], ["2026-10-26", "2026-10-31"]]);
  expect(result.weeks.map(w => w.total)).toEqual([30, 15, 0, 0, 5]);
  expect(result.total).toBe(50);
  expect(result.count).toBe(4);
});
test("sumas diarias incluyen cancelaciones pagadas pero no pendientes ni anulados", () => {
  const result = buildWeeklyVisits([job("2026-10-19", 20), job("2026-10-19", 20, "cancelado_no_estaba", { ganancia: 10 }), job("2026-10-19", 80, "pendiente"), job("2026-10-19", 80, "realizado", { eliminado_logico: true })], "2026-10");
  const monday = result.weeks[3]?.days[0];
  expect(monday?.date).toBe("2026-10-19");
  expect(monday?.jobs.length).toBe(2);
  expect(monday?.total).toBe(30);
  expect(result.total).toBe(30);
});
test("el mes siguiente comienza en cero sin visitas pagadas", () => {
  expect(buildWeeklyVisits([job("2026-10-31", 50)], "2026-11").total).toBe(0);
});