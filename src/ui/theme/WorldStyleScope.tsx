import type { HTMLAttributes } from "react";
import "./index.css";

export type WorldStyle = "cartoon" | "hand-painted" | "watercolor";
export const WORLD_STYLES: ReadonlyArray<{ value: WorldStyle; label: string }> = [
  { value: "cartoon", label: "Cartoon" },
  { value: "hand-painted", label: "Hand-painted" },
  { value: "watercolor", label: "Watercolor" },
];

/** Local theme scope: nested previews don't change the user's saved world. */
export function WorldStyleScope({ worldStyle = "cartoon", className = "", ...props }:
  HTMLAttributes<HTMLDivElement> & { worldStyle?: WorldStyle }) {
  return <div {...props} data-world-style={worldStyle} className={`oq-theme ${className}`} />;
}
