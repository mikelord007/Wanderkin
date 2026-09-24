import React from "react";
import { createRoot } from "react-dom/client";
import { DesignKit } from "./DesignKit.js";
const root = document.getElementById("root");
if (root) createRoot(root).render(<React.StrictMode><DesignKit /></React.StrictMode>);
