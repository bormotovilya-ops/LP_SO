/** 10 пресетов тем + производные CSS-переменные из 4 базовых цветов */

export type ThemeId =
  | "couture-noir"
  | "soft-linen"
  | "midnight-champagne"
  | "praline-mocha"
  | "lagoon-teal"
  | "rose-dawn"
  | "slate-steel"
  | "olive-journal"
  | "violet-ink"
  | "amber-study";

export type FourColors = {
  background: string;
  foreground: string;
  surface: string;
  accent: string;
};

export const STORAGE_THEME = "lp-so-theme";
export const STORAGE_OVERRIDES = "lp-so-theme-overrides";

/** Тема при первом визите (нет сохранённого выбора в localStorage) */
export const DEFAULT_THEME: ThemeId = "soft-linen";

const CSS_VAR_KEYS = [
  "--background",
  "--foreground",
  "--surface",
  "--surface-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--accent-soft",
  "--hairline",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
  "--hero-overlay",
  "--shadow-elegant",
] as const;

type HSL = { h: number; s: number; l: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

export function hexToHsl(hex: string): HSL {
  const rgb = hexToRgb(hex);
  if (!rgb) return { h: 0, s: 0, l: 50 };
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToVar(h: HSL): string {
  return `${Math.round(h.h)} ${clamp(Math.round(h.s), 0, 100)}% ${clamp(Math.round(h.l), 0, 100)}%`;
}

function mix(a: HSL, b: HSL, t: number): HSL {
  return {
    h: a.h + (b.h - a.h) * t,
    s: a.s + (b.s - a.s) * t,
    l: a.l + (b.l - a.l) * t,
  };
}

function accentForeground(accent: HSL): HSL {
  return accent.l > 52 ? { h: 30, s: 12, l: 10 } : { h: 36, s: 28, l: 94 };
}

/** Производные токены для всего интерфейса из 4 выбранных цветов */
export function deriveThemeVars(colors: FourColors): Record<string, string> {
  const bg = hexToHsl(colors.background);
  const fg = hexToHsl(colors.foreground);
  const surf = hexToHsl(colors.surface);
  const acc = hexToHsl(colors.accent);
  const accFg = accentForeground(acc);
  const light = bg.l > 52;

  const muted = mix(bg, fg, light ? 0.12 : 0.18);
  muted.s *= 0.85;
  const mutedFg = mix(fg, bg, light ? 0.35 : 0.25);
  mutedFg.s *= 0.9;

  const accentSoft: HSL = { ...acc, l: clamp(acc.l + (light ? -6 : 8), 0, 100) };

  const hairline = mix(surf, fg, light ? 0.22 : 0.35);
  hairline.s *= 0.75;

  const cardL = light ? Math.min(99, surf.l + 5) : surf.l + (surf.l < 25 ? 4 : 2);
  const card: HSL = { ...surf, l: clamp(cardL, 0, 100) };

  const secondary = mix(surf, bg, 0.45);
  const border = mix(surf, fg, light ? 0.2 : 0.28);

  const destructive: HSL = { h: 0, s: 70, l: light ? 44 : 50 };

  const hero = light
    ? `linear-gradient(135deg, hsl(${hslToVar(bg)} / 0.38), hsl(${hslToVar(surf)} / 0.52))`
    : `linear-gradient(135deg, hsl(${hslToVar({ ...bg, l: clamp(bg.l - 2, 0, 100) })} / 0.92), hsl(${hslToVar(surf)} / 0.58))`;

  const shadowLift = light ? 0.22 : 0.65;
  const shadow = `0 30px 80px -30px hsl(${fg.h} ${clamp(fg.s, 15, 40)}% ${light ? 16 : 4}% / ${shadowLift})`;

  return {
    "--background": hslToVar(bg),
    "--foreground": hslToVar(fg),
    "--surface": hslToVar(surf),
    "--surface-foreground": hslToVar(fg),
    "--muted": hslToVar(muted),
    "--muted-foreground": hslToVar(mutedFg),
    "--accent": hslToVar(acc),
    "--accent-foreground": hslToVar(accFg),
    "--accent-soft": hslToVar(accentSoft),
    "--hairline": hslToVar(hairline),
    "--card": hslToVar(card),
    "--card-foreground": hslToVar(fg),
    "--popover": hslToVar(light ? card : bg),
    "--popover-foreground": hslToVar(fg),
    "--primary": hslToVar(acc),
    "--primary-foreground": hslToVar(accFg),
    "--secondary": hslToVar(secondary),
    "--secondary-foreground": hslToVar(fg),
    "--destructive": hslToVar(destructive),
    "--destructive-foreground": hslToVar({ h: 36, s: 30, l: 96 }),
    "--border": hslToVar(border),
    "--input": hslToVar(border),
    "--ring": hslToVar(acc),
    "--hero-overlay": hero,
    "--shadow-elegant": shadow,
  };
}

export function applyVarsToRoot(vars: Record<string, string>) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
}

export function clearCustomThemeVars() {
  const root = document.documentElement;
  for (const key of CSS_VAR_KEYS) {
    root.style.removeProperty(key);
  }
}

/** Базовые 4 цвета по умолчанию (подобраны под пресеты в index.css) */
export const THEME_DEFAULTS: Record<ThemeId, FourColors> = {
  "couture-noir": {
    background: "#1a1917",
    foreground: "#ebe4d9",
    surface: "#232220",
    accent: "#b8924a",
  },
  "soft-linen": {
    background: "#efe8dc",
    foreground: "#2c2824",
    surface: "#e8e0d4",
    accent: "#a8634a",
  },
  "midnight-champagne": {
    background: "#0d1520",
    foreground: "#e8e2d9",
    surface: "#141e2a",
    accent: "#d9c19a",
  },
  "praline-mocha": {
    background: "#241a15",
    foreground: "#efe8e2",
    surface: "#2e241d",
    accent: "#c4956a",
  },
  "lagoon-teal": {
    background: "#d8ede9",
    foreground: "#152a2e",
    surface: "#9ec4c0",
    accent: "#1f8a7a",
  },
  "rose-dawn": {
    background: "#f5e8ee",
    foreground: "#2d1f28",
    surface: "#eddce6",
    accent: "#b84d72",
  },
  "slate-steel": {
    background: "#e8ecf2",
    foreground: "#1a2230",
    surface: "#d5dce6",
    accent: "#3d6ea4",
  },
  "olive-journal": {
    background: "#ecebdf",
    foreground: "#252818",
    surface: "#deddcf",
    accent: "#5c6b3a",
  },
  "violet-ink": {
    background: "#f0ecf7",
    foreground: "#221a33",
    surface: "#e4dcf0",
    accent: "#6b4fa3",
  },
  "amber-study": {
    background: "#f4ecdc",
    foreground: "#2c2418",
    surface: "#ebe0cc",
    accent: "#c17f2a",
  },
};

export const THEME_LIST: {
  id: ThemeId;
  label: string;
  short: string;
}[] = [
  { id: "couture-noir", label: "Couture Noir", short: "Noir" },
  { id: "soft-linen", label: "Soft Linen", short: "Linen" },
  { id: "midnight-champagne", label: "Midnight", short: "Night" },
  { id: "praline-mocha", label: "Praline Mocha", short: "Mocha" },
  { id: "lagoon-teal", label: "Lagoon Teal", short: "Lagoon" },
  { id: "rose-dawn", label: "Rose Dawn", short: "Rose" },
  { id: "slate-steel", label: "Slate Steel", short: "Slate" },
  { id: "olive-journal", label: "Olive Journal", short: "Olive" },
  { id: "violet-ink", label: "Violet Ink", short: "Violet" },
  { id: "amber-study", label: "Amber Study", short: "Amber" },
];

export type PaletteLabels = { key: keyof FourColors; label: string }[];

export const PALETTE_LABELS: PaletteLabels = [
  { key: "background", label: "Фон" },
  { key: "surface", label: "Поверхность" },
  { key: "accent", label: "Акцент" },
  { key: "foreground", label: "Текст" },
];

export function loadOverrides(): Partial<Record<ThemeId, FourColors>> {
  try {
    const raw = localStorage.getItem(STORAGE_OVERRIDES);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<ThemeId, FourColors>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveOverrides(map: Partial<Record<ThemeId, FourColors>>) {
  localStorage.setItem(STORAGE_OVERRIDES, JSON.stringify(map));
}

export function loadStoredTheme(): ThemeId {
  const t = localStorage.getItem(STORAGE_THEME) as ThemeId | null;
  if (t && THEME_LIST.some((x) => x.id === t)) return t;
  return DEFAULT_THEME;
}

export function saveTheme(id: ThemeId) {
  localStorage.setItem(STORAGE_THEME, id);
}
