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
        closeButton
        toastOptions={{
          style: {
            background: "#090d18",
            border: "1px solid rgba(186,215,247, 0.15)",
            color: "#d8e2ee",
            backdropFilter: "blur(16px)",
            fontFamily: "Archivo, sans-serif",
          },
        }}
      />
    </QueryClientProvider>
  );
}
