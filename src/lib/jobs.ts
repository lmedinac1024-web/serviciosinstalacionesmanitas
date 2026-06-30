import type { Database } from "@/integrations/supabase/types";

export type Job = Database["public"]["Tables"]["jobs"]["Row"];
export type JobInsert = Database["public"]["Tables"]["jobs"]["Insert"];
export type JobStatus = Database["public"]["Enums"]["job_status"];

export const STATUS_LABELS: Record<JobStatus, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  realizado: "Realizado",
  cancelado_cliente: "Cancelado por cliente",
  cancelado_no_estaba: "No estaba en casa",
  cancelado_direccion: "Dirección incorrecta",
  cancelado_otro: "Cancelado (otro motivo)",
};

export const CANCEL_REASONS: { value: JobStatus; label: string }[] = [
  { value: "cancelado_cliente", label: "Cliente cancela" },
  { value: "cancelado_no_estaba", label: "No estaba en casa" },
  { value: "cancelado_direccion", label: "Dirección incorrecta" },
  { value: "cancelado_otro", label: "Otro motivo" },
];

export function statusColorClass(status: JobStatus): string {
  switch (status) {
    case "pendiente": return "bg-warning/15 text-warning-foreground border-warning/30";
    case "en_proceso": return "bg-info/15 text-info border-info/30";
    case "realizado": return "bg-success/15 text-success border-success/30";
    default: return "bg-destructive/15 text-destructive border-destructive/30";
  }
}

export function isCancelled(status: JobStatus): boolean {
  return status.startsWith("cancelado");
}

export function googleMapsUrl(j: Pick<Job, "direccion" | "codigo_postal" | "ciudad">): string {
  const parts = [j.direccion, j.codigo_postal, j.ciudad].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts)}`;
}

export function cleanPhone(phone?: string | null): string {
  return (phone ?? "").replace(/[^\d+]/g, "");
}

export function whatsappUrl(phone?: string | null): string {
  const p = cleanPhone(phone).replace(/^\+/, "");
  return `https://wa.me/${p}`;
}

export function telUrl(phone?: string | null): string {
  return `tel:${cleanPhone(phone)}`;
}

export function formatEUR(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v ?? 0);
}

export function jobTotal(j: Pick<Job, "importe" | "cantidad" | "total">): number {
  if (j.total != null) return Number(j.total);
  return Number(j.importe ?? 0) * Number(j.cantidad ?? 1);
}
