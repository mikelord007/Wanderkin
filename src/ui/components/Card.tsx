import type { HTMLAttributes } from "react";
import "./kit.css";
export function Card({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <article {...props} className={`oq-kit-card ${className}`} />;
}
