import monogram from "@/assets/monogram.svg";

export const Monogram = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <img src={monogram} alt="Светлана Ожгихина" className="h-10 w-auto md:h-12" />
    <div className="hidden flex-col leading-tight md:flex">
      <span className="font-display text-base text-foreground">Светлана Ожгихина</span>
      <span className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
        Бизнес-психолог
      </span>
    </div>
  </div>
);
