import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Landing } from "./landing";
import "./styles.css";

const root = document.getElementById("landing-root");
if (root === null) {
  throw new Error("#landing-root element missing");
}

createRoot(root).render(
  <StrictMode>
    <Landing />
  </StrictMode>
);
