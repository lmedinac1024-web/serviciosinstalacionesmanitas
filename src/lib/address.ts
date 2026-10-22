/**
 * Normalización de direcciones españolas para geocodificación y enlaces de mapa.
 *
 * Las órdenes vienen con abreviaturas ("CAL BEJAR", "AV DIAGONAL") y con
 * datos de piso/puerta ("ATIC 4ª", "3º 2ª") que confunden a Google Maps y
 * acaban enviando al trabajador a otra calle o a otro municipio.
 */

const TIPO_VIA: Record<string, string> = {
  cal: "Calle",
  "c/": "Calle",
  c: "Calle",
  cl: "Calle",
  calle: "Calle",
  carrer: "Carrer",
  cr: "Carrer",
  cc: "Carrer",
  "c.c": "Carrer",
  av: "Avenida",
  avd: "Avenida",
  avda: "Avenida",
  avinguda: "Avinguda",
  ps: "Paseo",
  pso: "Paseo",
  pg: "Passeig",
  passeig: "Passeig",
  pza: "Plaza",
  pz: "Plaza",
  pl: "Plaza",
  plz: "Plaza",
  placa: "Plaça",
  rbla: "Rambla",
  rb: "Rambla",
  trav: "Travessera",
  trv: "Travesía",
  ctra: "Carretera",
  crta: "Carretera",
  cra: "Carretera",
  ct: "Carretera",
  "ct.ct": "Carretera",
  "ctra.ctra": "Carretera",
  ptge: "Passatge",
  pje: "Pasaje",
  pasaje: "Pasaje",
  gv: "Gran Via",
  "g.v": "Gran Via",
  "c.c.": "Carrer",
  rda: "Ronda",
  urb: "Urbanización",
  cno: "Camino",
  ronda: "Ronda",
  via: "Vía",
};

/** Partes que indican piso/puerta/escalera: estorban al geocodificar. */
const PISO_RE =
  /\b(atico|ático|atic|bajos?|bjos?|entlo|entresuelo|principal|pral|esc(?:alera)?|pta|puerta|piso|pis|dpto|depto|dcha|izq(?:da)?|[0-9]{1,3}\s*[ºªo°]\s*[0-9]{0,3}\s*[ºªa°]?)\b.*$/i;

function stripAccentsLower(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Expande el tipo de vía abreviado al inicio de la calle. */
export function expandirTipoVia(calle: string): string {
  const s = calle.trim().replace(/\s+/g, " ");
  if (!s) return s;
  const m = s.match(/^([A-Za-zÀ-ÿ/.]+)\s+(.*)$/);
  if (!m) return s;
  const key = stripAccentsLower(m[1]).replace(/\.$/, "");
  const tipo = TIPO_VIA[key];
  return tipo ? `${tipo} ${m[2]}` : s;
}

/** Corrige solo abreviaturas conocidas; conserva el resto de la orden. */
export function normalizarDireccionOrden<T extends {
  direccion: string | null;
  numero: string | null;
  piso: string | null;
  puerta: string | null;
  codigo_postal: string | null;
  ciudad: string | null;
  direccion_completa: string | null;
}>(orden: T): T {
  const direccion = orden.direccion ? expandirTipoVia(orden.direccion) : null;
  const via = [direccion, orden.numero, orden.piso ? `Piso ${orden.piso}` : "", orden.puerta ? `Puerta ${orden.puerta}` : ""].filter(Boolean).join(" ");
  const localidad = [orden.codigo_postal, orden.ciudad].filter(Boolean).join(" ");
  const direccion_completa = direccion
    ? [via, localidad, "España"].filter(Boolean).join(", ")
    : orden.direccion_completa ? expandirTipoVia(orden.direccion_completa) : null;
  return { ...orden, direccion, direccion_completa };
}

/** Quita piso, puerta, escalera y similares del texto de la calle. */
export function quitarPisoPuerta(calle: string): string {
  return calle
    // "ESQ. AV. ROMA" / "ESQUINA ..." es una referencia de esquina: confunde a Google.
    .replace(/\s*\besq(?:uina)?\b\.?.*$/i, "")
    .replace(PISO_RE, "")
    .replace(/[,\s-]+$/, "")
    .trim();
}

/**
 * Devuelve la dirección para Google Maps: la de la orden con el tipo de vía
 * corregido y sin piso/puerta. Número, CP y ciudad se mantienen tal cual.
 */
export function direccionParaMapas(input: {
  direccion?: string | null;
  numero?: string | null;
  codigo_postal?: string | null;
  ciudad?: string | null;
}): string {
  // Se corrigen abreviaturas y errores de escritura del tipo de vía
  // ("CT.CT" → "Carretera", "CAL" → "Calle") y se quita piso/puerta, para que
  // Google Maps lleve al portal exacto (mismo número y código postal).
  const calle = quitarPisoPuerta(expandirTipoVia((input.direccion ?? "").trim().replace(/\s+/g, " ")));

  const numero = (input.numero ?? "").toString().trim();
  // Evita duplicar el número si ya venía dentro de la calle.
  const calleTieneNumero = numero && new RegExp(`(^|\\s)${numero.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$|-)`).test(calle);
  const via = [calle, calleTieneNumero ? "" : numero].filter(Boolean).join(" ").trim();

  const cp = (input.codigo_postal ?? "").toString().trim();
  const ciudad = (input.ciudad ?? "").toString().trim();

  return [via, cp, ciudad, "España"].filter(Boolean).join(", ");
}
