import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Datos extraídos de la orden de trabajo.
 * Todos los campos son opcionales; si no se detectan quedan como null.
 */
export type OrdenParseada = {
  nombre_cliente: string | null;
  telefono: string | null;
  telefonos_extra: string[];
  direccion: string | null;
  numero: string | null;
  piso: string | null;
  puerta: string | null;
  codigo_postal: string | null;
  ciudad: string | null;
  direccion_completa: string | null;
  fecha_servicio: string | null; // yyyy-mm-dd
  hora_servicio: string | null;  // HH:mm
  hora_inicio: string | null;
  hora_fin: string | null;
  fecha_asignacion: string | null;
  tipo_servicio: string | null;
  observaciones: string | null;
  trabajador_nombre: string | null;
  precio_servicio: number | null;
  precio_llegada: number | null;
  numero_operacion: string | null;
  numero_servicio: string | null;
};

export type OcrOrdenResultado = {
  ok: true;
  campos: OrdenParseada & { trabajador_id: string | null };
  aviso_cp: boolean;
  aviso_trabajador: boolean;
  aviso_cliente: boolean;
  texto_ocr: string;
} | {
  ok: false;
  reason: string;
};

const PROMPT = `Eres un asistente que lee una foto o captura de una orden de trabajo (fontanería, electricidad, ventiladores, manitas...) escrita en español y devuelve SOLO un JSON válido con estos campos. Si un campo no aparece o no es fiable, ponlo a null.

Estructura JSON exacta:
{
  "nombre_cliente": string|null,
  "telefono": string|null,
  "telefonos_extra": string[],
  "direccion": string|null,
  "numero": string|null,
  "piso": string|null,
  "puerta": string|null,
  "codigo_postal": string|null,
  "ciudad": string|null,
  "direccion_completa": string|null,
  "fecha_servicio": string|null,
  "hora_servicio": string|null,
  "hora_inicio": string|null,
  "hora_fin": string|null,
  "fecha_asignacion": string|null,
  "tipo_servicio": "Manitas"|"Fontanería"|"Instalación de ventilador"|"Electricidad"|"Mixto / Varios"|"Otro"|null,
  "observaciones": string|null,
  "trabajador_nombre": string|null,
  "precio_servicio": number|null,
  "precio_llegada": number|null,
  "numero_operacion": string|null,
  "numero_servicio": string|null,
  "texto_bruto": string
}

REGLAS:
- FECHAS en formato ISO yyyy-mm-dd. HORAS en formato HH:mm (24h).
- Si aparece "Fecha y hora: Fecha 01/07/2026 y Hora 13:00" → fecha_servicio="2026-07-01", hora_servicio="13:00".
- Si aparece una franja como "06-07-26 09:00 - 11:00" → fecha_servicio="2026-07-06", hora_inicio="09:00", hora_fin="11:00", hora_servicio="09:00".
- Si sólo aparece fecha de asignación, ponla en fecha_asignacion y deja fecha_servicio a null (el servidor calculará el día siguiente).
- Si no aparece ninguna fecha, deja fecha_servicio y fecha_asignacion a null.
- CÓDIGO POSTAL: 5 dígitos. Si aparece con 4 (ej. "8930") añade un 0 delante → "08930". Si aparecen dos CP posibles, prioriza el que esté después de la etiqueta "Código Postal".
- DIRECCIÓN: separa calle, número, piso y puerta. Ejemplos:
  * "CAL MANZANARES 25 1 1  08014-BARCELONA" → direccion="CAL MANZANARES", numero="25", piso="1", puerta="1", codigo_postal="08014", ciudad="Barcelona".
  * "C INDÚSTRIA 76 6 4 BARCELONA - BARCELONA (08025)" → direccion="C INDÚSTRIA", numero="76", piso="6", puerta="4", codigo_postal="08025", ciudad="Barcelona".
  * "Rambla de la Mina 32 1 - 1 08039 Sant Adria de Besos Código Postal 8930" → direccion="Rambla de la Mina", numero="32", piso="1", puerta="1", codigo_postal="08930", ciudad="Sant Adrià de Besòs".
- Si después del número aparecen dos valores separados por espacio, guion o símbolo, son piso y puerta.
- direccion_completa: "<direccion> <numero> <piso> <puerta>, <codigo_postal> <ciudad>, España" sin duplicar espacios; si falta algo, omítelo.
- TELÉFONOS: extrae todos, elimina duplicados. El primero va en "telefono", los demás en "telefonos_extra".
- CLIENTE: busca etiquetas como Cliente, Titular, Asegurado, Nombre y apellidos, Nombre cliente. Si dice "Sin info" u equivalente, pon literal "Sin info".
- TRABAJADOR: si aparece "Servicio asignado a: <nombre>" o similar, pon el nombre en trabajador_nombre. Sólo el nombre, sin adornos.
- TIPO_SERVICIO detección por palabras clave (case-insensitive, sin acentos):
  * ventilador / lámpara ventilador / instalación de ventiladores → "Instalación de ventilador"
  * fuga, sifón, lavabo, grifo, tubería, atasco, bidet, pierde agua, inodoro → "Fontanería"
  * foco, enchufe, interruptor, punto de luz, mecanismo, electricidad → "Electricidad"
  * si mezcla varios de los anteriores → "Mixto / Varios"
  * si no se puede detectar → "Manitas"
- OBSERVACIONES: junta la descripción real del trabajo (Comentarios, Descripción, Trabajos, Avería, Servicio, Reparación). Frases separadas por punto y espacio, iniciales en mayúscula. NO incluyas: cambio de estado, sms enviado/no enviado, póliza, compañía, asignación interna, tramitador, expediente, id exp, parte, 1ª cita.
- PRECIOS: números (sin €). Si aparece "precio por llegada", ponlo en precio_llegada. Si no hay, deja null.
- numero_operacion y numero_servicio: identificadores tipo "Nº operación", "Nº servicio", "Expediente".
- texto_bruto: el texto completo tal cual lo lees en la imagen (mismo orden y saltos de línea aproximados). Sirve como respaldo.

Responde ÚNICAMENTE con el JSON, sin markdown, sin explicaciones.`;

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function calcularFechaServicio(f_servicio: string | null, f_asignacion: string | null): string {
  if (f_servicio && /^\d{4}-\d{2}-\d{2}$/.test(f_servicio)) return f_servicio;
  const base = f_asignacion && /^\d{4}-\d{2}-\d{2}$/.test(f_asignacion) ? new Date(f_asignacion) : new Date();
  base.setDate(base.getDate() + 1);
  return base.toISOString().slice(0, 10);
}

export const parseOrdenImagen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { imagenBase64: string; mime: string }) => d)
  .handler(async ({ data, context }): Promise<OcrOrdenResultado> => {
    // Guard de rol: admin / super_admin / supervisor
    const [{ data: isAdmin }, { data: isSuper }, { data: isSup }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "supervisor" }),
    ]);
    if (!isAdmin && !isSuper && !isSup) {
      return { ok: false, reason: "forbidden" };
    }

    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) return { ok: false, reason: "missing_ai_key" };

    const dataUrl = `data:${data.mime || "image/jpeg"};base64,${data.imagenBase64}`;

    let respJson: {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: PROMPT },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      });
      if (r.status === 402) return { ok: false, reason: "credits_exhausted" };
      if (r.status === 429) return { ok: false, reason: "rate_limited" };
      respJson = await r.json();
      if (!r.ok) {
        return { ok: false, reason: `ai_error_${r.status}` };
      }
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "network_error" };
    }

    const contenido = respJson?.choices?.[0]?.message?.content ?? "";
    let parsed: Record<string, unknown>;
    try {
      // Quitar posibles bloques markdown por si acaso
      const clean = contenido
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      parsed = JSON.parse(clean);
    } catch {
      return { ok: false, reason: "invalid_json" };
    }

    const cpBruto = (parsed.codigo_postal as string | null) ?? null;
    let cp = cpBruto;
    let aviso_cp = false;
    if (cp && /^\d{4}$/.test(cp)) {
      cp = "0" + cp;
      aviso_cp = true;
    }
    if (cp && !/^\d{5}$/.test(cp)) cp = null;

    const rawExtra = parsed.telefonos_extra;
    const extraArr = Array.isArray(rawExtra)
      ? (rawExtra as unknown[]).map((v) => String(v)).filter(Boolean)
      : [];

    const fecha_servicio = calcularFechaServicio(
      (parsed.fecha_servicio as string | null) ?? null,
      (parsed.fecha_asignacion as string | null) ?? null,
    );

    // Buscar trabajador
    const trabajador_nombre = ((parsed.trabajador_nombre as string | null) ?? null)?.trim() || null;
    let trabajador_id: string | null = null;
    let aviso_trabajador = false;
    if (trabajador_nombre) {
      const { data: roles } = await context.supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "empleado");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length > 0) {
        const { data: perfiles } = await context.supabase
          .from("profiles")
          .select("user_id, username, display_name")
          .in("user_id", ids);
        const objetivo = normalize(trabajador_nombre);
        const match = (perfiles ?? []).find((p) => {
          const a = normalize(p.display_name ?? "");
          const b = normalize(p.username ?? "");
          return (
            a === objetivo ||
            b === objetivo ||
            (a && objetivo.includes(a)) ||
            (b && objetivo.includes(b)) ||
            (a && a.includes(objetivo)) ||
            (b && b.includes(objetivo))
          );
        });
        trabajador_id = match?.user_id ?? null;
      }
      if (!trabajador_id) aviso_trabajador = true;
    }

    const nombre_cliente = ((parsed.nombre_cliente as string | null) ?? null)?.toString().trim() || null;
    const aviso_cliente = !nombre_cliente || normalize(nombre_cliente).includes("sin info");

    const campos = {
      nombre_cliente,
      telefono: ((parsed.telefono as string | null) ?? null) || null,
      telefonos_extra: extraArr,
      direccion: ((parsed.direccion as string | null) ?? null) || null,
      numero: ((parsed.numero as string | null) ?? null) || null,
      piso: ((parsed.piso as string | null) ?? null) || null,
      puerta: ((parsed.puerta as string | null) ?? null) || null,
      codigo_postal: cp,
      ciudad: ((parsed.ciudad as string | null) ?? null) || null,
      direccion_completa: ((parsed.direccion_completa as string | null) ?? null) || null,
      fecha_servicio,
      hora_servicio: ((parsed.hora_servicio as string | null) ?? null) || null,
      hora_inicio: ((parsed.hora_inicio as string | null) ?? null) || null,
      hora_fin: ((parsed.hora_fin as string | null) ?? null) || null,
      fecha_asignacion: ((parsed.fecha_asignacion as string | null) ?? null) || null,
      tipo_servicio: ((parsed.tipo_servicio as string | null) ?? null) || null,
      observaciones: ((parsed.observaciones as string | null) ?? null) || null,
      trabajador_nombre,
      precio_servicio:
        parsed.precio_servicio == null || parsed.precio_servicio === ""
          ? null
          : Number(parsed.precio_servicio),
      precio_llegada:
        parsed.precio_llegada == null || parsed.precio_llegada === ""
          ? null
          : Number(parsed.precio_llegada),
      numero_operacion: ((parsed.numero_operacion as string | null) ?? null) || null,
      numero_servicio: ((parsed.numero_servicio as string | null) ?? null) || null,
      trabajador_id,
    };

    const texto_ocr = ((parsed.texto_bruto as string | null) ?? contenido).toString();

    return {
      ok: true,
      campos,
      aviso_cp,
      aviso_trabajador,
      aviso_cliente,
      texto_ocr,
    };
  });
