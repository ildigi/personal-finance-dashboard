import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { AppProviders } from "./app/providers";
import { createAppRouter } from "./app/router";

const router = createAppRouter();
const container = document.getElementById("root");
// eslint-disable-next-line i18next/no-literal-string -- errore di programmazione, prima che l'app esista
if (!container) throw new Error("Elemento #root mancante");

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
