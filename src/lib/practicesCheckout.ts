/** Прямая оплата через каталог Точки (сумма задаётся в кабинете Точки, не в коде). */
export const DEFAULT_TOCHKA_CHECKOUT_URL =
  "https://checkout.tochka.com/bc380cff-5068-49b3-a450-73b2e54d7684/order";

export function getTochkaCheckoutUrl(): string {
  const fromEnv = import.meta.env.VITE_TOCHKA_CHECKOUT_URL?.trim();
  return fromEnv || DEFAULT_TOCHKA_CHECKOUT_URL;
}
