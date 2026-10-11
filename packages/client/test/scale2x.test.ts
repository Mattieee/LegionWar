import { describe, expect, it } from "vitest";
import { scale2x } from "../src/render/scale2x";

/** Grille de caractères → couleurs (une lettre = une couleur). */
function grid(rows: string[]): { src: Uint32Array; w: number; h: number } {
  const w = rows[0]?.length ?? 0;
  const h = rows.length;
  const src = new Uint32Array(w * h);
  rows.forEach((row, y) => [...row].forEach((ch, x) => (src[y * w + x] = ch.charCodeAt(0))));
  return { src, w, h };
}

function upscale(rows: string[]): string[] {
  const { src, w, h } = grid(rows);
  const dst = new Uint32Array(w * h * 4);
  scale2x(src, w, h, dst, 0, 0, w - 1, h - 1);
  const out: string[] = [];
  for (let y = 0; y < h * 2; y++) {
    out.push(String.fromCharCode(...dst.subarray(y * w * 2, (y + 1) * w * 2)));
  }
  return out;
}

describe("Scale2x (frontières adoucies)", () => {
  it("une zone unie reste unie", () => {
    expect(upscale(["aa", "aa"])).toEqual(["aaaa", "aaaa", "aaaa", "aaaa"]);
  });

  it("une case isolée n'est pas effacée", () => {
    expect(upscale(["aaa", "aba", "aaa"])[2]).toBe("aabbaa");
  });

  it("un escalier devient une diagonale", () => {
    // Avant (×2 brut) : bbaaaa / bbaaaa / bbbbaa / bbbbaa ; après : chaque marche est coupée
    // en biais, des deux côtés de la frontière.
    const out = upscale(["baa", "bba", "bbb"]);
    expect(out).toEqual(["bbaaaa", "bbbaaa", "bbbaaa", "bbbbba", "bbbbbb", "bbbbbb"]);
  });

  it("n'invente aucune couleur", () => {
    const rows = ["abca", "bcab", "cabc"];
    const colors = new Set(rows.join(""));
    for (const row of upscale(rows)) for (const ch of row) expect(colors.has(ch)).toBe(true);
  });

  it("ne recalcule que le rectangle demandé", () => {
    const { src, w, h } = grid(["ab", "ba"]);
    const dst = new Uint32Array(w * h * 4).fill(0);
    scale2x(src, w, h, dst, 1, 1, 1, 1);
    expect(dst[0]).toBe(0);
    expect(dst[3 * w * 2 + 3]).not.toBe(0);
  });
});
