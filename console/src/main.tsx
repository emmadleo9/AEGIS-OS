import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/aegis-hud.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { TickProvider } from "./contexts/useTick";
import { loadTranslations } from "./i18n/translations";
import { detectDefaultLanguage, type Language } from "./stores/uiSlice";

import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient();

window.addEventListener("vite:preloadError", (event) => {
  const KEY = "chunk-reload-at";
  const last = Number(sessionStorage.getItem(KEY) || 0);
  if (Date.now() - last < 10_000) return;

  sessionStorage.setItem(KEY, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

function detectLanguage(): Language {
  try {
    const stored = JSON.parse(localStorage.getItem("app-state") || "{}") as {
      state?: { ui?: { language?: Language } };
    };
    const language = stored.state?.ui?.language;
    if (language) return language;
  } catch {
    /* ignore */
  }

  return detectDefaultLanguage();
}

const initialLang = detectLanguage();
await loadTranslations(initialLang);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);