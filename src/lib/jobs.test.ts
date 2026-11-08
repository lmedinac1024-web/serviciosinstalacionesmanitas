import { expect, test } from "vitest";
import { isValidServicePrice } from "./jobs";

test("el precio del servicio siempre es mayor o igual a 10 euros", () => {
  for (const price of [-1, 0, 9, 9.99, "9.99", "", null, undefined, NaN, Infinity]) {
    expect(isValidServicePrice(price)).toBe(false);
  }
  for (const price of [10, "10", 10.01, 15, 100]) {
    expect(isValidServicePrice(price)).toBe(true);
  }
});