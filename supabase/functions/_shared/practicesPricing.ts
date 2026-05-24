/** Дефолт: 4 990 ₽. Переопределение: Supabase Secret `PRACTICES_AMOUNT_KOPECKS` (копейки). */
export const PRACTICES_AMOUNT_KOPECKS_DEFAULT = 499_000;

/** Минимум 1 ₽ — защита от опечаток в секрете. */
const PRACTICES_AMOUNT_KOPECKS_MIN = 100;

export function getPracticesAmountKopecks(): number {
  const raw = Deno.env.get("PRACTICES_AMOUNT_KOPECKS")?.trim();
  if (!raw) return PRACTICES_AMOUNT_KOPECKS_DEFAULT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < PRACTICES_AMOUNT_KOPECKS_MIN) {
    console.warn(
      "[practicesPricing] invalid PRACTICES_AMOUNT_KOPECKS, using default",
      raw,
    );
    return PRACTICES_AMOUNT_KOPECKS_DEFAULT;
  }
  return n;
}

export function formatPracticesPriceLabel(kopecks: number): string {
  const rubles = kopecks / 100;
  if (kopecks % 100 === 0) {
    return `${Math.round(rubles).toLocaleString("ru-RU")} ₽`;
  }
  return `${rubles.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

export function getPracticesPriceLabel(): string {
  return formatPracticesPriceLabel(getPracticesAmountKopecks());
}
