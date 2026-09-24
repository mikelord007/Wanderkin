import type { ReactNode } from "react";
import "./kit.css";
export function EmptyState({ title, description, icon, action }: { title: string; description: string; icon?: ReactNode; action?: ReactNode }) {
  return <div className="oq-kit-empty">
    {icon && <span className="oq-kit-empty__icon" aria-hidden="true">{icon}</span>}
    <h3>{title}</h3><p className="oq-kit-muted">{description}</p>{action}
  </div>;
}
