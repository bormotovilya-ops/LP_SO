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
  { href: "#test", label: "Тест" },
  { href: "#contact", label: "Диагностика" },
  { href: "/oferta", label: "Оферта" },
  { href: "/privacy", label: "Конфиденциальность" },
] as const;
