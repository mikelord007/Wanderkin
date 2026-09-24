import { Button } from "./Button.js";
import { Icon } from "./Icon.js";
export function Toast({ message, onDismiss, tone = "success" }: { message: string; onDismiss: () => void; tone?: "success" | "error" | "info" }) {
  return <div className="oq-kit-toast" data-tone={tone}>
    <span role={tone === "error" ? "alert" : "status"}>{message}</span>
    <Button variant="ghost" onClick={onDismiss} aria-label="Dismiss notification"><Icon name="close" /></Button>
  </div>;
}
