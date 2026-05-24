import { useEffect, useState } from "react";
import {
  fetchPracticesPricing,
  getPracticesPricingFallback,
  type PracticesPricing,
} from "@/lib/practicesPricing";

export function usePracticesPricing(): PracticesPricing & { loading: boolean } {
  const [state, setState] = useState(() => ({
    ...getPracticesPricingFallback(),
    loading: true,
  }));

  useEffect(() => {
    let cancelled = false;
    void fetchPracticesPricing().then((pricing) => {
      if (!cancelled) {
        setState({ ...pricing, loading: false });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
