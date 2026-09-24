export interface ColorRestorationSink {
  setColorRestoration(value: number): void;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * The gameplay-to-render seam for Lost Colors. Scene code only consumes a
 * 0..1 value; it never imports mode state or collectible rules.
 */
export class ColorRestorationAdapter {
  private value: number;

  constructor(
    private readonly sink: ColorRestorationSink,
    initialValue = 0,
  ) {
    this.value = clamp(initialValue);
  }

  get current(): number {
    return this.value;
  }

  apply(value: number): boolean {
    const next = clamp(value);
    if (next === this.value) return false;
    this.value = next;
    this.sink.setColorRestoration(next);
    return true;
  }

  reset(value: number): void {
    this.value = clamp(value);
    this.sink.setColorRestoration(this.value);
  }
}
