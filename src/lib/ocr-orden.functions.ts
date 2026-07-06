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
- Acepta CUALQUIER formato de orden: tablas, capturas de aseguradoras, partes de HomeServe, listas simples tipo "Nombre y apellidos / Dirección / Teléfono / Fecha y hora / Nº de Operación / Servicio", texto plano, fotos torcidas o con etiquetas en rojo.
- Formato lista simple (aseguradora tipo Reale/Mapfre/etc.) con etiquetas "Nombre y apellidos:", "Dirección:", "Teléfono:", "Fecha y hora:", "Nº de Operación:", "Servicio:":
  * "Nombre y apellidos: MARÍA DOLORES TRIVIÑO MARÍA DOLORES TRIVIÑO" → nombre_cliente="María Dolores Triviño" (deduplica nombres repetidos).
  * "Dirección: maria auxiliadora 138, 1º1º Código Postal 8912" → direccion="Maria Auxiliadora", numero="138", piso="1", puerta="1", codigo_postal="08912".
  * "Teléfono: 661229811" → telefono="661229811".
  * "Fecha y hora: Fecha 03/07/2026 y Hora 08:00:00" → fecha_servicio="2026-07-03", hora_servicio="08:00".
  * "Nº de Operación: 180541" → numero_operacion="180541".
  * "Servicio: Instaladores de ventiladores de techo" → tipo_servicio="Instalación de ventilador", observaciones="Instalación de ventilador de techo".
- Formato HomeServe / aseguradora con etiquetas a la izquierda:
  * "SERVICIO: 15795510" → numero_servicio="15795510".
  * "TELEFONOS: 600592387 de 09:00 a 20:00" → telefono="600592387". NO uses 09:00/20:00 como cita si sólo son horario de llamada.
  * "CLIENTE:" → nombre_cliente.
  * "DOMICILIO: CAL VERNTALLAT 29 1 2" → direccion="CAL VERNTALLAT", numero="29", piso="1", puerta="2".
  * "POBLACION-PROVINCIA: 08024-BARCELONA" → codigo_postal="08024", ciudad="Barcelona".
  * "FECHA ASIGNACION: 03/07/2026" → fecha_asignacion="2026-07-03".
  * "COMENTARIOS:" contiene la avería/trabajo. Ignora cambios de estado, SMS, póliza, compañía y asignaciones internas.
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

function limpiarEspacios(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
}

function toTitle(s: string): string {
  return limpiarEspacios(s.toLowerCase()).replace(/\b\p{L}/gu, (m) => m.toUpperCase());
}

function fechaIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const iso = s.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const es = s.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
  if (!es) return null;
  const year = es[3].length === 2 ? `20${es[3]}` : es[3];
  return `${year}-${es[2].padStart(2, "0")}-${es[1].padStart(2, "0")}`;
}

function cpValido(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).match(/\b(\d{4,5})\b/);
  if (!m) return null;
  const cp = m[1].length === 4 ? `0${m[1]}` : m[1];
  return /^\d{5}$/.test(cp) ? cp : null;
}

function primerTexto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function sacarBloque(text: string, labels: string[]): string | null {
  const stop = "servicio|actualmente\\s*(?:en)?|telefonos|tel[eé]fonos|personas\\s+relacionadas|cliente|domicilio|poblaci[oó]n\\s*-?\\s*provincia|compa[nñ][ií]a|poliza\\s+num\\.?|p[oó]liza\\s+num\\.?|fecha\\s+asignaci[oó]n|siguiente\\s+acci[oó]n|comentarios";
  const variants = labels.join("|");
  const re = new RegExp(`(?:^|\\n)\\s*(?:${variants})\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*(?:${stop})\\s*:?|$)`, "i");
  const m = text.replace(/\r/g, "\n").match(re);
  return m?.[1] ? limpiarEspacios(m[1]) : null;
}

function sacarTelefonos(text: string): string[] {
  const out: string[] = [];
  const re = /(^|[^\d])(?:\+34\s*)?([6789](?:[\s.-]?\d){8})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tel = m[2].replace(/\D/g, "");
    if (tel.length === 9 && !out.includes(tel)) out.push(tel);
  }
  return out;
}

function parseDireccion(valor: string | null): Pick<OrdenParseada, "direccion" | "numero" | "piso" | "puerta"> {
  if (!valor) return { direccion: null, numero: null, piso: null, puerta: null };
  const clean = limpiarEspacios(valor.replace(/\b(n[ºo]\.?|num\.?|número)\b/gi, " "));
  const m = clean.match(/^(.*?)[,\s]+(\d+[a-zA-Z]?)(?:\s*[-/ºª\s]+(\d+[a-zA-Z]?))?(?:\s*[-/ºª\s]+(\d+[a-zA-Z]?))?$/);
  if (!m) return { direccion: clean, numero: null, piso: null, puerta: null };
  return {
    direccion: limpiarEspacios(m[1]),
    numero: m[2] ?? null,
    piso: m[3] ?? null,
    puerta: m[4] ?? null,
  };
}

function tipoDesdeTexto(text: string): OrdenParseada["tipo_servicio"] {
  const n = normalize(text);
  if (/ventilador/.test(n)) return "Instalación de ventilador";
  if (/lampara|aplique|plafon|foco|enchufe|interruptor|punto de luz|mecanismo|electric/.test(n)) return "Electricidad";
  if (/fuga|sifon|lavabo|grifo|tuberia|atasco|bidet|pierde agua|inodoro/.test(n)) return "Fontanería";
  if (/manitas|reparacion|instalacion|montaje/.test(n)) return "Manitas";
  return null;
}

function limpiarComentarios(valor: string | null): string | null {
  if (!valor) return null;
  const frases = valor
    .split(/(?:\n|\s{2,}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\s*-)/)
    .map((s) => limpiarEspacios(s.replace(/^[-–•]+\s*/, "")))
    .filter(Boolean)
    .filter((s) => !/estado asignado|servicio asignado|sms|cambio de estado|compa[nñ][ií]a|p[oó]liza|tramitador|expediente|prof\.\s*web/i.test(s));
  return frases.length ? frases.join(". ") : null;
}

function parseCamposFallback(texto: string): Partial<OrdenParseada> {
  const servicio = sacarBloque(texto, ["servicio"]);
  const telefonosBloque = sacarBloque(texto, ["telefonos", "tel[eé]fonos"]);
  const cliente = sacarBloque(texto, ["cliente"]);
  const domicilio = sacarBloque(texto, ["domicilio"]);
  const poblacion = sacarBloque(texto, ["poblaci[oó]n\\s*-?\\s*provincia"]);
  const fechaAsignacion = sacarBloque(texto, ["fecha\\s+asignaci[oó]n"]);
  const comentarios = sacarBloque(texto, ["comentarios"]);
  const tels = sacarTelefonos(telefonosBloque || texto);
  const dir = parseDireccion(domicilio);
  const cp = cpValido(poblacion || texto);
  const ciudadMatch = (poblacion || "").match(/\b\d{4,5}\b\s*[-,]?\s*([A-Za-zÀ-ÿ .'-]+)/);
  const ciudad = ciudadMatch?.[1] ? toTitle(ciudadMatch[1]) : null;
  const observaciones = limpiarComentarios(comentarios);
  const partesDireccion = [dir.direccion, dir.numero, dir.piso, dir.puerta].filter(Boolean).join(" ");
  return {
    nombre_cliente: cliente,
    telefono: tels[0] ?? null,
    telefonos_extra: tels.slice(1),
    ...dir,
    codigo_postal: cp,
    ciudad,
    direccion_completa: partesDireccion || cp || ciudad ? limpiarEspacios(`${partesDireccion}${partesDireccion && (cp || ciudad) ? ", " : ""}${[cp, ciudad].filter(Boolean).join(" ")}, España`) : null,
    fecha_asignacion: fechaIso(fechaAsignacion),
    tipo_servicio: tipoDesdeTexto(comentarios || texto),
    observaciones,
    numero_servicio: servicio?.match(/\b\d{4,}\b/)?.[0] ?? null,
  };
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
    const archivoOrden = data.mime === "application/pdf"
      ? { type: "file" as const, file: { filename: "orden.pdf", file_data: dataUrl } }
      : { type: "image_url" as const, image_url: { url: dataUrl } };

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
                archivoOrden,
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
      const jsonText = clean.startsWith("{") ? clean : clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1);
      parsed = JSON.parse(jsonText);
    } catch {
      return { ok: false, reason: "invalid_json" };
    }

    const texto_ocr = ((parsed.texto_bruto as string | null) ?? contenido).toString();
    const fallback = parseCamposFallback(texto_ocr);

    const cpBruto = primerTexto(parsed.codigo_postal) ?? fallback.codigo_postal ?? null;
    let cp = cpValido(cpBruto);
    let aviso_cp = false;
    if (cpBruto && /^\d{4}$/.test(cpBruto)) {
      aviso_cp = true;
    }
    if (cpBruto && /^\d{4}$/.test(cpBruto) && !cp) {
      cp = `0${cpBruto}`;
      aviso_cp = true;
    }

    const rawExtra = parsed.telefonos_extra;
    const extraArrRaw = Array.isArray(rawExtra)
      ? (rawExtra as unknown[]).map((v) => String(v)).filter(Boolean)
      : [];
    const telefonoPrincipal = primerTexto(parsed.telefono) ?? fallback.telefono ?? null;
    const extraArr = Array.from(new Set([...extraArrRaw, ...(fallback.telefonos_extra ?? [])].filter((t) => t !== telefonoPrincipal)));

    const fecha_servicio = calcularFechaServicio(
      fechaIso(primerTexto(parsed.fecha_servicio)) ?? fallback.fecha_servicio ?? null,
      fechaIso(primerTexto(parsed.fecha_asignacion)) ?? fallback.fecha_asignacion ?? null,
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

    const nombre_cliente = primerTexto(parsed.nombre_cliente) ?? fallback.nombre_cliente ?? null;
    const aviso_cliente = !nombre_cliente || normalize(nombre_cliente).includes("sin info");

    const campos = {
      nombre_cliente,
      telefono: telefonoPrincipal,
      telefonos_extra: extraArr,
      direccion: primerTexto(parsed.direccion) ?? fallback.direccion ?? null,
      numero: primerTexto(parsed.numero) ?? fallback.numero ?? null,
      piso: primerTexto(parsed.piso) ?? fallback.piso ?? null,
      puerta: primerTexto(parsed.puerta) ?? fallback.puerta ?? null,
      codigo_postal: cp,
      ciudad: primerTexto(parsed.ciudad) ?? fallback.ciudad ?? null,
      direccion_completa: primerTexto(parsed.direccion_completa) ?? fallback.direccion_completa ?? null,
      fecha_servicio,
      hora_servicio: primerTexto(parsed.hora_servicio),
      hora_inicio: primerTexto(parsed.hora_inicio),
      hora_fin: primerTexto(parsed.hora_fin),
      fecha_asignacion: fechaIso(primerTexto(parsed.fecha_asignacion)) ?? fallback.fecha_asignacion ?? null,
      tipo_servicio: primerTexto(parsed.tipo_servicio) ?? fallback.tipo_servicio ?? null,
      observaciones: primerTexto(parsed.observaciones) ?? fallback.observaciones ?? null,
      trabajador_nombre,
      precio_servicio:
        parsed.precio_servicio == null || parsed.precio_servicio === ""
          ? null
          : Number(parsed.precio_servicio),
      precio_llegada:
        parsed.precio_llegada == null || parsed.precio_llegada === ""
          ? null
          : Number(parsed.precio_llegada),
      numero_operacion: primerTexto(parsed.numero_operacion),
      numero_servicio: primerTexto(parsed.numero_servicio) ?? fallback.numero_servicio ?? null,
      trabajador_id,
    };

    return {
      ok: true,
      campos,
      aviso_cp,
      aviso_trabajador,
      aviso_cliente,
      texto_ocr,
    };
  });
