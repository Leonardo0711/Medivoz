
import React, { Suspense, lazy } from "react";
import { HelmetProvider, Helmet } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "./contexts/AuthContext";
import { PrivateRoute } from "./components/auth/PrivateRoute";
import { RoleRoute } from "./components/auth/RoleRoute";
import { ThemeProvider } from "./contexts/ThemeContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { UnsavedRecordProvider } from "./contexts/UnsavedRecordContext";

// Lazy load pages for better performance
// This reduces initial bundle size by code-splitting pages
// Each page is loaded only when needed, improving first load time
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Patients = lazy(() => import("./pages/Patients"));
const Session = lazy(() => import("./pages/Session"));
const Agents = lazy(() => import("./pages/Agents"));
const AgentDetail = lazy(() => import("./pages/AgentDetail"));
const Templates = lazy(() => import("./pages/Templates"));
const Evaluations = lazy(() => import("./pages/Evaluations"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Loading fallback component with better UX
// Shows a centered spinner while lazy-loaded pages are being fetched
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300">
      <div className="relative">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <div className="absolute inset-0 h-10 w-10 rounded-full border-2 border-primary/20" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-foreground">Cargando...</p>
        <p className="text-xs text-muted-foreground">Por favor espere un momento</p>
      </div>
    </div>
  </div>
);

// Create a client with production-optimized configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: import.meta.env.PROD ? 3 : 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    },
    mutations: {
      retry: import.meta.env.PROD ? 2 : 0,
    },
  },
});

const App = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <UnsavedRecordProvider>
          <React.StrictMode>
          <HelmetProvider>
            <Helmet>
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>Medivoz</title>
            </Helmet>
            <ThemeProvider>
              <QueryClientProvider client={queryClient}>
                <AuthProvider>
                  <TooltipProvider>
                    <Toaster />
                    <Sonner />
                    <Suspense fallback={<PageLoader />}>
                      <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/signup" element={<Signup />} />
                        <Route element={<PrivateRoute />}>
                          <Route element={<RoleRoute allowedRoles={["doctor", "administrador"]} />}>
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/patients" element={<Patients />} />
                            <Route path="/session" element={<Session />} />
                            <Route path="/history" element={<Navigate to="/patients" replace />} />
                            <Route path="/agents" element={<Agents />} />
                            <Route path="/agents/:id" element={<AgentDetail />} />
                            <Route path="/templates" element={<Templates />} />
                          </Route>
                          <Route element={<RoleRoute allowedRoles={["evaluador", "administrador"]} />}>
                            <Route path="/evaluations" element={<Evaluations />} />
                          </Route>
                        </Route>
                        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </TooltipProvider>
                </AuthProvider>
              </QueryClientProvider>
            </ThemeProvider>
          </HelmetProvider>
          </React.StrictMode>
        </UnsavedRecordProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
