/**
 * Mathématiques déterministes.
 *
 * Math.exp/log/pow/sin… sont « approximés par l'implémentation » selon la spec ECMAScript :
 * deux navigateurs peuvent renvoyer des résultats différents au dernier bit, ce qui suffit à
 * désynchroniser une simulation lockstep. Ces fonctions n'utilisent que + − × ÷ (exacts en
 * IEEE-754) et des manipulations de bits, donc donnent le même résultat partout.
 */

const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const LN2 = 0.6931471805599453;
const SQRT2 = 1.4142135623730951;

const view = new DataView(new ArrayBuffer(8));

/** 2^k exact pour k entier dans [-1022, 1023]. */
function pow2(k: number): number {
  view.setUint32(0, ((k + 1023) << 20) >>> 0);
  view.setUint32(4, 0);
  return view.getFloat64(0);
}

export function exp(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x > 709.7) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x / LN2);
  const r = x - k * LN2_HI - k * LN2_LO;
  let term = 1;
  let sum = 1;
  for (let i = 1; i <= 20; i++) {
    term = (term * r) / i;
    sum += term;
  }
  if (k > 1000) return sum * pow2(k - 1000) * pow2(1000);
  if (k < -1000) return sum * pow2(k + 1000) * pow2(-1000);
  return sum * pow2(k);
}

export function log(x: number): number {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  let e = (hi >>> 20) & 0x7ff;
  if (e === 0) {
    // Nombre dénormalisé : on le remonte dans la plage normale.
    return log(x * 18014398509481984) - 54 * LN2;
  }
  e -= 1023;
  view.setUint32(0, ((hi & 0x800fffff) | (1023 << 20)) >>> 0);
  let m = view.getFloat64(0);
  if (m > SQRT2) {
    m /= 2;
    e += 1;
  }
  // log(m) = 2·atanh(s), s = (m−1)/(m+1), |s| ≤ 0,172
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let term = s;
  let sum = 0;
  for (let k = 0; k < 30; k++) {
    sum += term / (2 * k + 1);
    term *= s2;
  }
  return 2 * sum + e * LN2_HI + e * LN2_LO;
}

/** x^y pour x ≥ 0. */
export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x === 0) return 0;
  if (x < 0) return NaN;
  return exp(y * log(x));
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export const DetMath = { exp, log, pow, clamp };
