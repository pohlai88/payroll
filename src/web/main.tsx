/**
 * @feature shell
 * @layer spine
 *
 * SPA Vite entry → App.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./shadcn.css";
import "./payrun/payslip-document/payslip-print.css";


const root = document.getElementById("root");
if (root === null) {
  throw new Error("#root element missing");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
