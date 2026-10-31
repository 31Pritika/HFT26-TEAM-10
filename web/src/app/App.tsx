import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";
import { router } from "./routes";
import { useTheme } from "../shared/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  const theme = useTheme();

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <Suspense fallback={null}>
          <RouterProvider router={router} />
        </Suspense>
      </MotionConfig>
      <Toaster
        theme={theme}
        position="top-right"
        closeButton
        toastOptions={{
          style: {
            background: "var(--elevated)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            fontFamily: "var(--font-sans)",
          },
        }}
      />
    </QueryClientProvider>
  );
}
