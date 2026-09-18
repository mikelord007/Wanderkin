import { useEffect, useState } from "react";

/** Whole seconds elapsed since `startedAtIso`, ticking every second. Used
 * for truthful "how long has this been running" text — never a fake
 * percentage. */
export function useElapsedSeconds(startedAtIso: string | undefined): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAtIso) {
      setElapsed(0);
      return;
    }
    const startMs = new Date(startedAtIso).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAtIso]);

  return elapsed;
}

export function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}
