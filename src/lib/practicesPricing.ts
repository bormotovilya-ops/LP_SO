import { functionsApiUrl } from "@/lib/functionsApi";

export const PRACTICES_AMOUNT_KOPECKS_DEFAULT = 499_000;

export type PracticesPricing = {
  amountKopecks: number;
  priceLabel: string;
};

export function formatPracticesPriceLabel(kopecks: number): string {
  const rubles = kopecks / 100;
  if (kopecks % 100 === 0) {
    return `${Math.round(rubles).toLocaleString("ru-RU")} ₽`;
  }
  return `${rubles.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function readViteAmountKopecks(): number | null {
  const raw = import.meta.env.VITE_PRACTICES_AMOUNT_KOPECKS?.trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 100 ? n : null;
}

function pricingFromKopecks(kopecks: number): PracticesPricing {
  return { amountKopecks: kopecks, priceLabel: formatPracticesPriceLabel(kopecks) };
}

let cache: PracticesPricing | null = null;
let inflight: Promise<PracticesPricing> | null = null;

/** Цена с API (Secret `PRACTICES_AMOUNT_KOPECKS`) или из `VITE_PRACTICES_AMOUNT_KOPECKS`. */
export async function fetchPracticesPricing(): Promise<PracticesPricing> {
  const viteKopecks = readViteAmountKopecks();
  if (viteKopecks !== null) {
    cache = pricingFromKopecks(viteKopecks);
    return cache;
  }

  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(functionsApiUrl("/practices-config"), { method: "GET" });
      const data = (await res.json()) as {
        ok?: boolean;
        amountKopecks?: number;
        priceLabel?: string;
      };
      if (res.ok && data.ok && typeof data.amountKopecks === "number" && data.priceLabel) {
        cache = { amountKopecks: data.amountKopecks, priceLabel: data.priceLabel };
        return cache;
      }
    } catch {
      // fallback below
    }
    return pricingFromKopecks(PRACTICES_AMOUNT_KOPECKS_DEFAULT);
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function getPracticesPricingFallback(): PracticesPricing {
  const viteKopecks = readViteAmountKopecks();
  return pricingFromKopecks(viteKopecks ?? PRACTICES_AMOUNT_KOPECKS_DEFAULT);
}
