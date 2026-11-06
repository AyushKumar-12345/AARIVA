import React from "react";
import { createRoot } from "react-dom/client";
import StudentApp from "./StudentApp.jsx";
import { BRAND } from "./branding.js";
import "./styles.css";

document.title = `${BRAND.name} — ${BRAND.tagline}`;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <StudentApp />
  </React.StrictMode>,
);
