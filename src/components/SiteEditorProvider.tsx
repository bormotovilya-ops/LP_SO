import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";

type SiteEditorContextValue = {
  isEditing: boolean;
  toggleEditing: () => void;
  rollbackCurrentPage: () => void;
  rollbackAllPages: () => void;
};

type SnapshotEntry = {
  html: string;
  style: string;
};

type SnapshotMap = Record<string, SnapshotEntry>;

const SiteEditorContext = createContext<SiteEditorContextValue | null>(null);

const BASELINE_STORAGE_KEY = "lp-site-editor-baseline-v1";
const EDITS_STORAGE_KEY = "lp-site-editor-edits-v1";
const EDITABLE_SELECTOR = "h1, h2, h3, h4, h5, h6, p, li, a, button, label, blockquote, figcaption, td, th";
const THEME_COLOR_VARIABLES = [
  "--foreground",
  "--accent",
  "--muted-foreground",
  "--primary",
  "--secondary-foreground",
];
const FONT_SIZES = ["12px", "14px", "16px", "20px", "24px", "32px"];

const readSnapshotMap = (key: string): SnapshotMap => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as SnapshotMap;
  } catch {
    return {};
  }
};

const writeSnapshotMap = (key: string, value: SnapshotMap) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const getElementKey = (element: HTMLElement) => {
  const segments: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== document.body) {
    const parent = current.parentElement;
    if (!parent) break;
    const tag = current.tagName.toLowerCase();
    const sameTagSiblings = Array.from(parent.children).filter(
      (child) => child.tagName === current?.tagName,
    );
    const index = sameTagSiblings.indexOf(current) + 1;
    segments.unshift(`${tag}:nth-of-type(${index})`);
    current = parent;
  }

  return `${window.location.pathname}|${segments.join(">")}`;
};

const setElementEditable = (element: HTMLElement, editable: boolean) => {
  element.contentEditable = editable ? "true" : "false";
  element.spellcheck = false;
  if (editable) {
    element.setAttribute("data-site-editor-editable", "true");
  } else {
    element.removeAttribute("data-site-editor-editable");
  }
};

const applySnapshotEntry = (element: HTMLElement, entry: SnapshotEntry) => {
  element.innerHTML = entry.html;
  if (entry.style) {
    element.setAttribute("style", entry.style);
  } else {
    element.removeAttribute("style");
  }
};

const resolveThemeColor = (variableName: string) => {
  if (typeof window === "undefined") return "#ffffff";
  const cssValue = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  if (!cssValue) return "#ffffff";
  return `hsl(${cssValue})`;
};

const getSelectorFromKey = (key: string) => {
  const separatorIndex = key.indexOf("|");
  if (separatorIndex === -1) return "";
  return key.slice(separatorIndex + 1);
};

const isElementEligible = (element: HTMLElement) => {
  if (element.closest("[data-site-editor-ignore='true']")) return false;
  if (!element.textContent?.trim()) return false;
  return true;
};

export const SiteEditorProvider = ({ children }: PropsWithChildren) => {
  const location = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [baselineMap, setBaselineMap] = useState<SnapshotMap>(() => readSnapshotMap(BASELINE_STORAGE_KEY));
  const [editsMap, setEditsMap] = useState<SnapshotMap>(() => readSnapshotMap(EDITS_STORAGE_KEY));
  const editableElementsRef = useRef<HTMLElement[]>([]);
  const baselineMapRef = useRef<SnapshotMap>(baselineMap);
  const editsMapRef = useRef<SnapshotMap>(editsMap);

  useEffect(() => {
    baselineMapRef.current = baselineMap;
    writeSnapshotMap(BASELINE_STORAGE_KEY, baselineMap);
  }, [baselineMap]);

  useEffect(() => {
    editsMapRef.current = editsMap;
    writeSnapshotMap(EDITS_STORAGE_KEY, editsMap);
  }, [editsMap]);

  const collectEditableElements = useCallback(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(EDITABLE_SELECTOR)).filter(isElementEligible);
    editableElementsRef.current = elements;
    return elements;
  }, []);

  const persistElementEdit = useCallback((element: HTMLElement) => {
    const key = element.dataset.siteEditorKey ?? getElementKey(element);
    const nextEntry: SnapshotEntry = {
      html: element.innerHTML,
      style: element.getAttribute("style") ?? "",
    };

    setEditsMap((prev) => ({ ...prev, [key]: nextEntry }));
  }, []);

  useEffect(() => {
    const elements = collectEditableElements();
    const missingBaselineEntries: SnapshotMap = {};

    elements.forEach((element) => {
      const key = getElementKey(element);
      element.dataset.siteEditorKey = key;

      const baselineEntry = baselineMapRef.current[key];
      if (!baselineEntry) {
        missingBaselineEntries[key] = {
          html: element.innerHTML,
          style: element.getAttribute("style") ?? "",
        };
      }

      const editedEntry = editsMapRef.current[key];
      if (editedEntry) {
        applySnapshotEntry(element, editedEntry);
      }

      setElementEditable(element, isEditing);
    });

    if (Object.keys(missingBaselineEntries).length > 0) {
      setBaselineMap((prev) => ({ ...prev, ...missingBaselineEntries }));
    }
  }, [collectEditableElements, isEditing, location.pathname]);

  useEffect(() => {
    if (!isEditing) return;

    const handleInput = (event: Event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLElement)) return;
      persistElementEdit(target);
    };

    const handleClickCapture = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-site-editor-ignore='true']")) return;
      if (target.closest("a, button")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    editableElementsRef.current.forEach((element) => {
      element.addEventListener("input", handleInput);
      element.addEventListener("blur", handleInput);
    });

    document.addEventListener("click", handleClickCapture, true);

    return () => {
      editableElementsRef.current.forEach((element) => {
        element.removeEventListener("input", handleInput);
        element.removeEventListener("blur", handleInput);
      });
      document.removeEventListener("click", handleClickCapture, true);
    };
  }, [isEditing, persistElementEdit]);

  const applyDocumentCommand = useCallback((command: string, value?: string) => {
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
  }, []);

  const applyFontSize = useCallback(
    (fontSize: string) => {
      applyDocumentCommand("fontSize", "7");
      const scopeSelector = "[data-site-editor-editable='true'] font[size='7']";
      const fontTags = Array.from(document.querySelectorAll<HTMLFontElement>(scopeSelector));

      fontTags.forEach((fontTag) => {
        const span = document.createElement("span");
        span.style.fontSize = fontSize;
        span.innerHTML = fontTag.innerHTML;
        fontTag.replaceWith(span);
      });

      const selectionAnchor = window.getSelection()?.anchorNode;
      const editableAncestor =
        selectionAnchor instanceof HTMLElement
          ? selectionAnchor.closest<HTMLElement>("[data-site-editor-editable='true']")
          : selectionAnchor?.parentElement?.closest<HTMLElement>("[data-site-editor-editable='true']");

      if (editableAncestor) {
        persistElementEdit(editableAncestor);
      }
    },
    [applyDocumentCommand, persistElementEdit],
  );

  const rollbackCurrentPage = useCallback(() => {
    const currentPathPrefix = `${window.location.pathname}|`;
    const baselineEntries = Object.entries(baselineMapRef.current).filter(([key]) =>
      key.startsWith(currentPathPrefix),
    );

    if (baselineEntries.length === 0) return;

    baselineEntries.forEach(([key, baselineEntry]) => {
      const selector = getSelectorFromKey(key);
      if (!selector) return;
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return;
      applySnapshotEntry(element, baselineEntry);
    });

    setEditsMap((prev) => {
      const nextMap = { ...prev };
      Object.keys(nextMap).forEach((key) => {
        if (key.startsWith(currentPathPrefix)) {
          delete nextMap[key];
        }
      });
      return nextMap;
    });
  }, []);

  const rollbackAllPages = useCallback(() => {
    rollbackCurrentPage();
    setEditsMap({});
  }, [rollbackCurrentPage]);

  const saveAndCloseEditor = useCallback(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement.dataset.siteEditorEditable === "true") {
      persistElementEdit(activeElement);
      activeElement.blur();
    }
    setIsEditing(false);
  }, [persistElementEdit]);

  const contextValue = useMemo<SiteEditorContextValue>(
    () => ({
      isEditing,
      toggleEditing: () => setIsEditing((prev) => !prev),
      rollbackCurrentPage,
      rollbackAllPages,
    }),
    [isEditing, rollbackAllPages, rollbackCurrentPage],
  );

  return (
    <SiteEditorContext.Provider value={contextValue}>
      {children}
      {isEditing ? (
        <div
          className="fixed left-1/2 top-3 z-[120] flex w-[min(96vw,820px)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-md border border-hairline bg-background/95 px-3 py-2 shadow-xl backdrop-blur-sm"
          data-site-editor-ignore="true"
        >
          <span className="mr-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Редактор</span>
          <button
            type="button"
            className="rounded border border-hairline px-2 py-1 text-xs text-foreground transition-colors hover:border-accent hover:text-accent"
            onClick={() => applyDocumentCommand("bold")}
          >
            B
          </button>
          <button
            type="button"
            className="rounded border border-hairline px-2 py-1 text-xs italic text-foreground transition-colors hover:border-accent hover:text-accent"
            onClick={() => applyDocumentCommand("italic")}
          >
            I
          </button>
          <select
            className="h-7 rounded border border-hairline bg-background px-2 text-xs text-foreground outline-none"
            defaultValue="16px"
            onChange={(event) => applyFontSize(event.target.value)}
          >
            {FONT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <div className="mx-1 flex items-center gap-1">
            {THEME_COLOR_VARIABLES.map((variableName) => {
              const color = resolveThemeColor(variableName);
              return (
                <button
                  key={variableName}
                  type="button"
                  className="h-6 w-6 rounded-full border border-hairline transition-transform hover:scale-110"
                  style={{ backgroundColor: color }}
                  onClick={() => applyDocumentCommand("foreColor", color)}
                  aria-label={`Выбрать цвет ${variableName}`}
                />
              );
            })}
          </div>
          <button
            type="button"
            className="ml-auto rounded border border-hairline px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-accent"
            onClick={rollbackCurrentPage}
          >
            Откатить страницу
          </button>
          <button
            type="button"
            className="rounded border border-hairline px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:text-accent"
            onClick={rollbackAllPages}
          >
            Откатить всё
          </button>
          <button
            type="button"
            className="rounded border border-accent bg-accent/15 px-3 py-1 text-xs text-accent transition-colors hover:bg-accent/25"
            onClick={saveAndCloseEditor}
          >
            Сохранить
          </button>
        </div>
      ) : null}
    </SiteEditorContext.Provider>
  );
};

export const useSiteEditor = () => {
  const context = useContext(SiteEditorContext);
  if (!context) {
    throw new Error("useSiteEditor must be used within SiteEditorProvider");
  }
  return context;
};
