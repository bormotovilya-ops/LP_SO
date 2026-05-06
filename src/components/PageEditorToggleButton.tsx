import { Pencil } from "lucide-react";
import { useSiteEditor } from "@/components/SiteEditorProvider";
import { useAuth } from "@/contexts/AuthContext";

export const PageEditorToggleButton = () => {
  const { isEditing, toggleEditing } = useSiteEditor();
  const { canEditSite } = useAuth();

  if (!canEditSite) return null;

  return (
    <button
      type="button"
      className={`fixed right-4 top-4 z-[110] inline-flex h-9 w-9 items-center justify-center rounded-sm border transition-opacity md:right-6 md:top-6 ${
        isEditing
          ? "border-accent/80 bg-accent/10 text-accent"
          : "border-hairline/50 bg-background/85 text-foreground/40 opacity-80 hover:opacity-100"
      }`}
      data-site-editor-ignore="true"
      onClick={toggleEditing}
      aria-label={isEditing ? "Выйти из редактора" : "Редактор текста (карандаш)"}
      title={isEditing ? "Сохраните изменения в панели редактора" : "Редактировать тексты на странице"}
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  );
};
