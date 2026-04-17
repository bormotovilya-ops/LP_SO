import { useEffect, useState } from "react";

export type ThemeId = "couture-noir" | "soft-linen" | "midnight-champagne";

const THEMES: { id: ThemeId; label: string; short: string; swatch: string; ring: string }[] = [
  { id: "couture-noir", label: "Couture Noir", short: "Noir", swatch: "#1c1917", ring: "#B8924A" },
  { id: "soft-linen", label: "Soft Linen", short: "Linen", swatch: "#EFE8DC", ring: "#A8634A" },
  { id: "midnight-champagne", label: "Midnight", short: "Night", swatch: "#0F1620", ring: "#D9C19A" },
];

export const ThemeSwitcher = () => {
  const [theme, setTheme] = useState<ThemeId>("couture-noir");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div className="fixed bottom-4 right-4 z-[60] md:bottom-6 md:right-6">
      <div className="flex items-center gap-1 border border-hairline bg-surface/95 px-2 py-2 shadow-lg backdrop-blur-md">
        <span className="hidden px-2 text-[10px] uppercase tracking-[0.28em] text-muted-foreground sm:inline">
          Тема
        </span>
        {THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              aria-label={`Тема ${t.label}`}
              aria-pressed={active}
              className="group relative flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] transition-all"
              style={{
                color: active ? t.ring : "hsl(var(--muted-foreground))",
                borderBottom: active ? `1px solid ${t.ring}` : "1px solid transparent",
              }}
            >
              <span
                className="h-3 w-3 rounded-full border"
                style={{ backgroundColor: t.swatch, borderColor: t.ring }}
              />
              <span>{t.short}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
