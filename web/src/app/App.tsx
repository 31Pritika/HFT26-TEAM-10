import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { router } from "./routes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster
        theme="dark"
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: "#111111",
            border: "1px solid rgba(255, 255, 255, 0.16)",
            color: "#f5f2ec",
            fontFamily: "var(--font-sans), system-ui, sans-serif",
            borderRadius: "var(--radius)",
          },
        }}
      />
    </QueryClientProvider>
  );
}
