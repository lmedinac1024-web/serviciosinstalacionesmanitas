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

/** Quita piso, puerta, escalera y similares del texto de la calle. */
export function quitarPisoPuerta(calle: string): string {
  return calle.replace(PISO_RE, "").replace(/[,\s-]+$/, "").trim();
}

/**
 * Devuelve la dirección lista para Google Maps:
 * tipo de vía expandido, sin piso/puerta, con CP, ciudad y país.
 */
export function direccionParaMapas(input: {
  direccion?: string | null;
  numero?: string | null;
  codigo_postal?: string | null;
  ciudad?: string | null;
}): string {
  let calle = (input.direccion ?? "").trim();
  calle = quitarPisoPuerta(calle);
  calle = expandirTipoVia(calle);

  const numero = (input.numero ?? "").toString().trim();
  // Evita duplicar el número si ya venía dentro de la calle.
  const calleTieneNumero = numero && new RegExp(`(^|\\s)${numero.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$|-)`).test(calle);
  const via = [calle, calleTieneNumero ? "" : numero].filter(Boolean).join(" ").trim();

  const cp = (input.codigo_postal ?? "").toString().trim();
  const ciudad = (input.ciudad ?? "").toString().trim();

  return [via, cp, ciudad, "España"].filter(Boolean).join(", ");
}
