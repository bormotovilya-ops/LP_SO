import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFloatingDockMagnify } from "@/hooks/useFloatingDockMagnify";
import {
  DEFAULT_THEME,
  PALETTE_LABELS,
  THEME_DEFAULTS,
  THEME_LIST,
  applyVarsToRoot,
  clearCustomThemeVars,
  deriveThemeVars,
  loadOverrides,
  loadStoredTheme,
  saveOverrides,
  saveTheme,
} from "@/lib/themePalette";
import type { FourColors, ThemeId } from "@/lib/themePalette";

export type { ThemeId } from "@/lib/themePalette";

export const ThemeSwitcher = () => {
  const [theme, setTheme] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    return loadStoredTheme();
  });
  const [paletteFor, setPaletteFor] = useState<ThemeId | null>(null);
  const [barExpanded, setBarExpanded] = useState(false);
  const [draft, setDraft] = useState<FourColors>(THEME_DEFAULTS[DEFAULT_THEME]);
  const panelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dockGridRef = useRef<HTMLDivElement>(null);
  const dockBtnRefs = useRef<Map<ThemeId, HTMLButtonElement>>(new Map());
  const [dockHighlight, setDockHighlight] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [dockHot, setDockHot] = useState(false);

  const themeIds = useMemo(() => THEME_LIST.map((x) => x.id), []);
  const getDockBtn = useCallback((id: ThemeId) => dockBtnRefs.current.get(id) ?? null, []);
  const {
    scales: dockScales,
    onMouseMove: onDockMouseMove,
    onMouseLeave: onDockMouseLeave,
    refreshCenters: refreshDockCenters,
  } = useFloatingDockMagnify(themeIds, getDockBtn);

  const updateDockHighlight = useCallback((id: ThemeId) => {
    const grid = dockGridRef.current;
    const btn = dockBtnRefs.current.get(id);
    if (!grid || !btn) return;
    const gr = grid.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    setDockHighlight({
      left: br.left - gr.left,
      top: br.top - gr.top,
      width: br.width,
      height: br.height,
    });
  }, []);

  const finishConfig = useCallback(() => {
    setPaletteFor(null);
    setBarExpanded(false);
  }, []);

  const applyThemeCss = useCallback((id: ThemeId) => {
    document.documentElement.setAttribute("data-theme", id);
    const o = loadOverrides()[id];
    if (o) {
      applyVarsToRoot(deriveThemeVars(o));
    } else {
      clearCustomThemeVars();
    }
  }, []);

  useEffect(() => {
    applyThemeCss(theme);
  }, [theme, applyThemeCss]);

  useLayoutEffect(() => {
    if (!barExpanded) return;
    const run = () => {
      refreshDockCenters();
      updateDockHighlight(theme);
    };
    run();
    const id = requestAnimationFrame(run);
    const t = window.setTimeout(run, 280);
    window.addEventListener("resize", run);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
      window.removeEventListener("resize", run);
    };
  }, [theme, barExpanded, updateDockHighlight, refreshDockCenters]);

  useEffect(() => {
    if (!paletteFor) return;
    const next = loadOverrides()[paletteFor] ?? THEME_DEFAULTS[paletteFor];
    setDraft({ ...next });
  }, [paletteFor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (paletteFor) {
        if (panelRef.current?.contains(t)) return;
        if (barRef.current?.contains(t)) return;
        finishConfig();
        return;
      }
      if (barExpanded) {
        if (barRef.current?.contains(t)) return;
        setBarExpanded(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [paletteFor, barExpanded, finishConfig]);

  const openPalette = (id: ThemeId) => {
    setBarExpanded(true);
    setTheme(id);
    saveTheme(id);
    setPaletteFor(id);
  };

  const updateDraft = (key: keyof FourColors, value: string) => {
    setDraft((d) => ({ ...d, [key]: value.startsWith("#") ? value : `#${value}` }));
  };

  const handleApply = () => {
    if (!paletteFor) return;
    const def = THEME_DEFAULTS[paletteFor];
    const sameAsPreset =
      draft.background === def.background &&
      draft.foreground === def.foreground &&
      draft.surface === def.surface &&
      draft.accent === def.accent;
    if (sameAsPreset) {
      const map = { ...loadOverrides() };
      delete map[paletteFor];
      saveOverrides(map);
      clearCustomThemeVars();
    } else {
      saveOverrides({ ...loadOverrides(), [paletteFor]: { ...draft } });
      applyVarsToRoot(deriveThemeVars(draft));
    }
    finishConfig();
  };

  const handleReset = () => {
    if (!paletteFor) return;
    const map = { ...loadOverrides() };
    delete map[paletteFor];
    saveOverrides(map);
    clearCustomThemeVars();
    setDraft({ ...THEME_DEFAULTS[paletteFor] });
  };

  const currentDef = THEME_DEFAULTS[theme];

  return (
    <div
      ref={barRef}
      className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2 md:bottom-6 md:right-6"
    >
      {paletteFor && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={`Палитра: ${THEME_LIST.find((x) => x.id === paletteFor)?.label}`}
          className="w-[min(100vw-2rem,20rem)] rounded-2xl border border-white/10 bg-popover/95 p-4 text-popover-foreground backdrop-blur-xl"
          style={{ boxShadow: "var(--shadow-elegant)" }}
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Палитра</div>
              <div className="font-display text-lg text-foreground">
                {THEME_LIST.find((x) => x.id === paletteFor)?.label}
              </div>
            </div>
            <button
              type="button"
              onClick={finishConfig}
              className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
            >
              Закрыть
            </button>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            Четыре базовых цвета пересчитывают остальные токены темы. «Применить» сохраняет настройку в браузере.
          </p>
          <div className="space-y-3">
            {PALETTE_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 text-sm">
                <input
                  type="color"
                  value={draft[key].slice(0, 7)}
                  onChange={(e) => updateDraft(key, e.target.value)}
                  className="h-9 w-11 cursor-pointer border border-hairline bg-transparent p-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
                  <input
                    type="text"
                    value={draft[key]}
                    onChange={(e) => updateDraft(key, e.target.value)}
                    className="mt-1 w-full border border-hairline bg-background px-2 py-1 font-mono text-xs text-foreground"
                    spellCheck={false}
                  />
                </div>
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={handleApply} className="btn-brass !px-4 !py-2 !text-[10px]">
              Применить
            </button>
            <button type="button" onClick={handleReset} className="btn-ghost-line !px-4 !py-2 !text-[10px]">
              Сбросить тему
            </button>
          </div>
        </div>
      )}

      {!barExpanded ? (
        <button
          type="button"
          onClick={() => setBarExpanded(true)}
          aria-expanded={false}
          aria-controls="theme-switcher-strip"
          className="theme-dock-float flex items-center gap-2 rounded-2xl border border-white/10 bg-surface/90 py-2 pl-3 pr-3 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.06)_inset] backdrop-blur-xl transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_16px_44px_-10px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)_inset]"
        >
          <span className="text-[9px] uppercase tracking-[0.28em] text-muted-foreground">Тема</span>
          <span
            className="h-7 w-7 shrink-0 rounded-full border-2 shadow-inner"
            style={{
              backgroundColor: currentDef.background,
              borderColor: currentDef.accent,
            }}
          />
        </button>
      ) : (
        <div
          id="theme-switcher-strip"
          className="theme-dock-float w-[min(100vw-2rem,22rem)] animate-in fade-in-0 zoom-in-95 overflow-visible rounded-2xl border border-white/10 bg-surface/90 p-3 shadow-[0_14px_48px_-14px_rgba(0,0,0,0.38),0_0_0_1px_rgba(255,255,255,0.07)_inset] duration-200 backdrop-blur-xl"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Тема</span>
            <button
              type="button"
              onClick={finishConfig}
              aria-label="Свернуть панель тем"
              className="rounded-lg px-2 py-0.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <div
            ref={dockGridRef}
            className="relative overflow-visible pb-1"
            onMouseEnter={() => {
              setDockHot(true);
              refreshDockCenters();
            }}
            onMouseLeave={() => {
              setDockHot(false);
              onDockMouseLeave();
            }}
            onMouseMove={onDockMouseMove}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute z-0 rounded-xl bg-gradient-to-b from-white/12 to-white/[0.04] shadow-[0_4px_16px_-4px_rgba(0,0,0,0.25)] ring-1 ring-white/10 transition-[transform,width,height,left,top,opacity] duration-500 ease-[cubic-bezier(0.34,1.3,0.64,1)]"
              style={{
                left: dockHighlight.left,
                top: dockHighlight.top,
                width: Math.max(0, dockHighlight.width),
                height: Math.max(0, dockHighlight.height),
                opacity: dockHot ? 0 : 1,
              }}
            />
            <div className="relative z-[1] grid grid-cols-5 gap-x-1 gap-y-1 overflow-visible sm:gap-y-2">
              {THEME_LIST.map((t, i) => {
                const active = theme === t.id;
                const def = THEME_DEFAULTS[t.id];
                const s = dockScales[i] ?? 1;
                return (
                  <div
                    key={t.id}
                    ref={(el) => {
                      if (el) dockBtnRefs.current.set(t.id, el);
                      else dockBtnRefs.current.delete(t.id);
                    }}
                    className="flex min-h-[48px] min-w-0 items-end justify-center sm:min-h-[52px]"
                  >
                    <button
                      type="button"
                      onClick={() => openPalette(t.id)}
                      aria-label={`Тема ${t.label}, открыть палитру`}
                      aria-pressed={active}
                      className="flex min-w-0 flex-col items-center gap-1 rounded-lg border border-transparent px-0.5 pb-0.5 pt-1 text-[8px] uppercase leading-tight tracking-[0.14em] will-change-transform sm:text-[9px] sm:tracking-[0.18em]"
                      style={{
                        color: active ? def.accent : "hsl(var(--muted-foreground))",
                        transform: `scale(${s})`,
                        transformOrigin: "50% 100%",
                        transition: "color 0.2s ease, transform 0.14s cubic-bezier(0.25, 0.8, 0.2, 1)",
                      }}
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border sm:h-3.5 sm:w-3.5"
                        style={{
                          backgroundColor: def.background,
                          borderColor: def.accent,
                          boxShadow: active ? `0 4px 12px -2px ${def.accent}66` : undefined,
                        }}
                      />
                      <span className="max-w-full truncate text-center">{t.short}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
