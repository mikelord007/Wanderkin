import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
