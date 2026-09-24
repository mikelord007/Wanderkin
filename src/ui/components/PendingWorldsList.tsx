import type { PendingWorldItem } from "../creationFlow.js";
import { WorldList, type WorldListItem } from "./WorldList.js";
import "../screens/creation.css";

export function PendingWorldsList({ worlds, onOpen }: { worlds: readonly PendingWorldItem[]; onOpen: (world: PendingWorldItem) => void }) {
  const items: WorldListItem[] = worlds.map(world => ({
    id: world.id,
    title: world.title,
    meta: `${world.style === "hand-painted" ? "Hand-painted" : world.style === "watercolor" ? "Watercolor" : "Cartoon"} · ${world.mode === "collect" ? "Collect" : world.mode === "race" ? "Race" : "Explore"}`,
    status: world.statusText,
    ...(world.previewUrl ? { preview: <img src={world.previewUrl} alt="" /> } : {}),
    actions: [{ id: world.primaryAction, label: world.primaryAction === "view-progress" ? "View progress" : world.primaryAction === "retry" ? "Retry" : world.primaryAction === "review" ? "Review choices" : "Resume", kind: "primary", onSelect: () => onOpen(world) }],
  }));
  return <WorldList items={items} label="Drafts and generations" />;
}

