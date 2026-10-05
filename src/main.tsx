import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthGate } from "@/components/auth/auth-gate";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't retry client errors such as a failed Access check.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <App />
      </AuthGate>
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
