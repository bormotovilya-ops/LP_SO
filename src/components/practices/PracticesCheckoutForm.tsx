import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { initPracticesCollectionPayment } from "@/lib/practicesPayment";

const PRACTICES_PRICE_LABEL = "4 990 ₽";

const buttonClasses =
  "inline-flex items-center justify-center border border-accent bg-background/85 px-5 py-3 text-xs uppercase tracking-[0.22em] text-accent transition-all hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50";

type PracticesCheckoutFormProps = {
  className?: string;
  buttonLabel?: string;
};

export function PracticesCheckoutForm({
  className = "",
  buttonLabel = `Оплатить ${PRACTICES_PRICE_LABEL}`,
}: PracticesCheckoutFormProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = await initPracticesCollectionPayment(email);
    setLoading(false);
    if (!result.ok) {
      toast({
        title: "Не удалось перейти к оплате",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    window.location.href = result.paymentUrl;
  };

  return (
    <form onSubmit={onSubmit} className={`flex flex-col gap-3 sm:flex-row sm:items-end ${className}`}>
      <label className="min-w-0 flex-1">
        <span className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Email для чека</span>
        <input
          type="email"
          name="receiptEmail"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-2 w-full border border-hairline bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
          disabled={loading}
        />
      </label>
      <button type="submit" className={`${buttonClasses} shrink-0`} disabled={loading}>
        {loading ? "Подождите…" : buttonLabel}
      </button>
    </form>
  );
}
