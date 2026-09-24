import type { ReactNode } from "react";
import { Button } from "./Button.js";
import { Card } from "./Card.js";

export interface WorldListAction {
  id: string;
  label: string;
  kind: "primary" | "secondary" | "ghost";
  onSelect: () => void;
}

export interface WorldListItem {
  id: string;
  title: string;
  meta: string;
  status: string;
  preview?: ReactNode;
  actions: readonly WorldListAction[];
}

/** Shared presentational boundary for pending creation and saved-world owners. */
export function WorldList({ items, label = "Worlds" }: { items: readonly WorldListItem[]; label?: string }) {
  return <div className="oq-kit-grid" aria-label={label}>{items.map(item => <Card key={item.id} className="oq-world-list__item oq-kit-stack">
    {item.preview ? <div className="oq-world-list__preview">{item.preview}</div> : null}
    <div><h3>{item.title}</h3><p className="oq-kit-muted">{item.meta}</p></div>
    <p className="oq-world-list__status">{item.status}</p>
    <div className="oq-kit-row">{item.actions.map(action => <Button key={action.id} variant={action.kind === "primary" ? "primary" : action.kind} onClick={action.onSelect}>{action.label}</Button>)}</div>
  </Card>)}</div>;
}
