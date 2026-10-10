/** Formate un nombre en français compact : 950, 12,5 k, 3,40 M. */
export function formatNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${(value / 1e6).toFixed(abs >= 1e7 ? 1 : 2).replace(".", ",")} M`;
  if (abs >= 1e4) return `${(value / 1e3).toFixed(abs >= 1e5 ? 0 : 1).replace(".", ",")} k`;
  return Math.floor(value).toLocaleString("fr-FR");
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1).replace(".", ",")} %`;
}

/** Durée en ticks (10 par seconde) → « 2:05 ». */
export function formatClock(ticks: number): string {
  const seconds = Math.max(0, Math.ceil(ticks / 10));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Lecture/écriture localStorage tolérante (navigation privée, stockage bloqué…). */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Stockage indisponible : la préférence ne sera simplement pas mémorisée.
    }
  },
};
