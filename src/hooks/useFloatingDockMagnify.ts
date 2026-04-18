import { useCallback, useRef, useState } from "react";

/** Как у macOS dock / Aceternity Floating Dock */
const INFLUENCE_PX = 110;
const MAX_SCALE = 1.58;
const MIN_SCALE = 1;

export function useFloatingDockMagnify<T extends string>(ids: readonly T[], getEl: (id: T) => HTMLElement | null) {
  const [scales, setScales] = useState<number[]>(() => ids.map(() => MIN_SCALE));
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  /** Центры якорей в координатах viewport — без transform, чтобы не было дрожания */
  const centersRef = useRef<{ x: number; y: number }[]>([]);

  const refreshCenters = useCallback(() => {
    centersRef.current = ids.map((id) => {
      const el = getEl(id);
      if (!el) return { x: -1e6, y: -1e6 };
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
  }, [ids, getEl]);

  const flush = useCallback(() => {
    rafRef.current = null;
    const p = pendingRef.current;
    if (!p) return;
    const { x, y } = p;
    const centers = centersRef.current;
    const next = ids.map((_, i) => {
      const c = centers[i];
      if (!c) return MIN_SCALE;
      const d = Math.hypot(x - c.x, y - c.y);
      const t = Math.max(0, 1 - d / INFLUENCE_PX);
      const eased = t * t * t;
      return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * eased;
    });
    setScales(next);
  }, [ids]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      pendingRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    },
    [flush],
  );

  const onMouseLeave = useCallback(() => {
    pendingRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setScales(ids.map(() => MIN_SCALE));
  }, [ids]);

  return { scales, onMouseMove, onMouseLeave, refreshCenters };
}
