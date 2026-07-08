import type { Database } from "@/integrations/supabase/types";

export type Job = Database["public"]["Tables"]["servicios"]["Row"];
export type JobInsert = Database["public"]["Tables"]["servicios"]["Insert"];
export type JobStatus = Database["public"]["Enums"]["job_status"];

export const STATUS_LABELS: Record<JobStatus, string> = {
  pendiente: "Pendiente",
  en_proceso: "En curso",
  realizado: "Realizado",
  cancelado_cliente: "Cancelado",
  cancelado_no_estaba: "Cancelado",
  cancelado_direccion: "Cancelado",
  cancelado_otro: "Cancelado",
};

/**
 * Motivos de cancelación (todos guardan `estado = cancelado_*` y suman ganancia).
 * El detalle enumerado se guarda en `motivo_cancelacion` como texto.
 */
export const CANCEL_REASONS: { status: JobStatus; label: string }[] = [
  { status: "cancelado_no_estaba", label: "Cliente no está en casa" },
  { status: "cancelado_direccion", label: "Dirección incorrecta" },
  { status: "cancelado_otro", label: "No se puede acceder" },
  { status: "cancelado_otro", label: "Material no disponible" },
  { status: "cancelado_otro", label: "No cubre" },
  { status: "cancelado_otro", label: "Error en el servicio" },
  { status: "cancelado_cliente", label: "Cliente cancela" },
  { status: "cancelado_otro", label: "Otro motivo" },
];

export const TIPO_SERVICIO_OPCIONES = [
  "Manitas",
  "Fontanería",
  "Instalación de ventilador",
  "Electricidad",
  "Mixto / Varios",
  "Otro",
] as const;

/** Un servicio anulado por admin (soft delete). */
export function isVoided(j: Pick<Job, "eliminado_logico">): boolean {
  return !!j.eliminado_logico;
}

export function displayStatus(j: Pick<Job, "estado" | "eliminado_logico">): string {
  if (isVoided(j)) return "Anulado";
  return STATUS_LABELS[j.estado];
}

export function statusColorClass(j: Pick<Job, "estado" | "eliminado_logico">): string {
  if (isVoided(j)) return "bg-muted text-muted-foreground border-border line-through";
  switch (j.estado) {
    case "pendiente": return "bg-warning/15 text-warning-foreground border-warning/30";
    case "en_proceso": return "bg-info/15 text-info border-info/30";
    case "realizado": return "bg-success/15 text-success border-success/30";
    default: return "bg-destructive/15 text-destructive border-destructive/30";
  }
}

export function isCancelled(status: JobStatus): boolean {
  return status.startsWith("cancelado");
}

/** Un servicio "paga" si está realizado o cancelado por el trabajador (y no anulado). */
export function isPaid(j: Pick<Job, "estado" | "eliminado_logico">): boolean {
  if (isVoided(j)) return false;
  return j.estado === "realizado" || isCancelled(j.estado);
}

export function googleMapsUrl(
  j: Pick<Job, "direccion" | "codigo_postal" | "ciudad"> & {
    numero?: string | null;
    direccion_completa?: string | null;
    direccion_lat?: number | string | null;
    direccion_lng?: number | string | null;
  },
): string {
  // Ruta desde la ubicación actual del usuario (Google Maps usa "Tu ubicación"
  // cuando se omite el parámetro origin) hasta el destino.
  const destination =
    j.direccion_lat != null && j.direccion_lng != null
      ? `${j.direccion_lat},${j.direccion_lng}`
      : [[j.direccion, j.numero].filter(Boolean).join(" "), j.codigo_postal, j.ciudad]
          .filter(Boolean)
          .join(", ") ||
        j.direccion_completa?.trim() ||
        j.direccion ||
        "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

export function cleanPhone(phone?: string | null): string {
  return (phone ?? "").replace(/[^\d+]/g, "");
}

export function whatsappUrl(phone?: string | null, message?: string): string {
  const p = cleanPhone(phone).replace(/^\+/, "");
  const base = `https://wa.me/${p}`;
  if (message) return `${base}?text=${encodeURIComponent(message)}`;
  return base;
}

export function telUrl(phone?: string | null): string {
  return `tel:${cleanPhone(phone)}`;
}

export function formatEUR(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v ?? 0);
}

export function jobTotal(j: Pick<Job, "ganancia" | "importe" | "precio_llegada" | "estado" | "eliminado_logico">): number {
  if (isVoided(j)) return 0;
  // La ganancia del trabajador es el campo `ganancia` si está definido;
  // en su defecto, `importe` para realizados y `precio_llegada` para cancelados.
  const g = j.ganancia == null ? null : Number(j.ganancia);
  if (g != null && !Number.isNaN(g)) return g;
  if (j.estado === "realizado") return Number(j.importe ?? 0);
  if (isCancelled(j.estado)) return Number(j.precio_llegada ?? 0);
  return 0;
}
