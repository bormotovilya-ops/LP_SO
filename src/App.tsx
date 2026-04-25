import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { HashRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteEditorProvider } from "@/components/SiteEditorProvider";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Oferta from "./pages/Oferta.tsx";
import PracticesCollectionDebtFreedom from "./pages/PracticesCollectionDebtFreedom.tsx";
import Privacy from "./pages/Privacy.tsx";
import QuizNumerology from "./pages/QuizNumerology.tsx";

const queryClient = new QueryClient();
function PaymentReturnRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const pay = params.get("pay");
    if (!pay) return;
    if (location.pathname !== "/") return;
    navigate(`/practices/svoboda-ot-dolgov${location.search}${location.hash}`, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SiteEditorProvider>
          <PaymentReturnRedirect />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/oferta" element={<Oferta />} />
            <Route path="/practices/svoboda-ot-dolgov" element={<PracticesCollectionDebtFreedom />} />
            <Route path="/quiz" element={<QuizNumerology />} />
            <Route path="/privacy" element={<Privacy />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SiteEditorProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
