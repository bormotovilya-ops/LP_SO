import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { HashRouter, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteEditorProvider } from "@/components/SiteEditorProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { CrmLayout } from "@/components/admin/CrmLayout";
import { ProtectedCrmRoute } from "@/components/admin/ProtectedCrmRoute";
import AdminLogin from "./pages/admin/AdminLogin.tsx";
import CrmContactDetail from "./pages/admin/CrmContactDetail.tsx";
import CrmContactNew from "./pages/admin/CrmContactNew.tsx";
import CrmContacts from "./pages/admin/CrmContacts.tsx";
import CrmDashboard from "./pages/admin/CrmDashboard.tsx";
import CrmTasks from "./pages/admin/CrmTasks.tsx";
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

function IndexSectionAlias() {
  const { section } = useParams();

  useEffect(() => {
    if (!section) return;
    const id = window.setTimeout(() => {
      document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [section]);

  return <Index />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <SiteEditorProvider>
            <PaymentReturnRedirect />
            <Routes>
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route
                path="/admin/crm"
                element={
                  <ProtectedCrmRoute>
                    <CrmLayout />
                  </ProtectedCrmRoute>
                }
              >
                <Route index element={<CrmDashboard />} />
                <Route path="tasks" element={<CrmTasks />} />
                <Route path="contacts" element={<CrmContacts />} />
                <Route path="contacts/new" element={<CrmContactNew />} />
                <Route path="contacts/:id" element={<CrmContactDetail />} />
              </Route>
              <Route path="/" element={<Index />} />
              <Route path="/oferta" element={<Oferta />} />
              <Route path="/practices/svoboda-ot-dolgov" element={<PracticesCollectionDebtFreedom />} />
              <Route path="/quiz" element={<QuizNumerology />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/:section" element={<IndexSectionAlias />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </SiteEditorProvider>
        </AuthProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
