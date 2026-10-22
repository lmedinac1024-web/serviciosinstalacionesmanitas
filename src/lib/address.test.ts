import { describe, expect, test } from "bun:test";
import { expandirTipoVia, normalizarDireccionOrden, direccionParaMapas } from "./address";

describe("abreviaturas de la dirección de la orden", () => {
  for (const [original, corregida] of [
    ["CT.CT ANTIGUA DE VALENCIA", "Carretera ANTIGUA DE VALENCIA"],
    ["CAL BEJAR", "Calle BEJAR"],
    ["C.C AGUDELLS", "Carrer AGUDELLS"],
    ["CL ARAGO", "Calle ARAGO"],
    ["AV. ROMA", "Avenida ROMA"],
  ]) {
    test(original, () => expect(expandirTipoVia(original)).toBe(corregida));
  }
  test("conserva portal, CP, ciudad, piso y puerta sin inventar referencias", () => {
    const orden = { direccion: "C.C AGUDELLS", numero: "76 BIS", piso: "4", puerta: "2", codigo_postal: "08032", ciudad: "BARCELONA", direccion_completa: "C.C AGUDELLS 76 BIS 4 2" };
    const result = normalizarDireccionOrden(orden);
    expect(result).toEqual({ ...orden, direccion: "Carrer AGUDELLS", direccion_completa: "Carrer AGUDELLS 76 BIS Piso 4 Puerta 2, 08032 BARCELONA, España" });
  });
  test("conserva un rango de portales al navegar y quita solo piso y puerta", () => {
    expect(direccionParaMapas({ direccion: "CAL BEJAR", numero: "79-83", codigo_postal: "08014", ciudad: "BARCELONA" })).toBe("Calle BEJAR 79-83, 08014, BARCELONA, España");
  });
  test("no corrige el código postal por proximidad", () => {
    const result = normalizarDireccionOrden({ direccion: "CL ARAGO", numero: "155", piso: null, puerta: null, codigo_postal: "08035", ciudad: "Barcelona", direccion_completa: null });
    expect(result.codigo_postal).toBe("08035");
    expect(result.direccion_completa).toBe("Calle ARAGO 155, 08035 Barcelona, España");
  });
});