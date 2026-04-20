/** Якоря секций лендинга — шапка и подвал */
export const SECTION_NAV = [
  { href: "#about", label: "Кому помогаю" },
  { href: "#method", label: "Метод" },
  { href: "#products", label: "Услуги" },
  { href: "#process", label: "Как работаем" },
  { href: "#reviews", label: "Отзывы" },
  { href: "#certificates", label: "Образование" },
] as const;

export const FOOTER_NAV_EXTRA = [
  // Временно скрыто по запросу
  // { href: "#test", label: "Тест" },
  { href: "#contact", label: "Диагностика" },
] as const;

/** Отдельный блок подвала — не смешивать с якорной навигацией по лендингу */
export const FOOTER_LEGAL_LINKS = [
  { href: "/oferta", label: "Договор-оферта" },
  { href: "/privacy", label: "Политика в отношении обработки персональных данных" },
] as const;
