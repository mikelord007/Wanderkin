import { useId, type ReactNode } from "react";
import "./kit.css";

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: string;
  description: string;
  image?: ReactNode;
  disabled?: boolean;
}
export interface ChoiceTilesProps<T extends string> {
  legend: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  name?: string;
  hint?: string;
}
/** Native radios retain standard Tab/arrow-key navigation and form semantics. */
export function ChoiceTiles<T extends string>({ legend, value, options, onChange, name, hint }: ChoiceTilesProps<T>) {
  const id = useId();
  return <fieldset className="oq-kit-choices" aria-describedby={hint ? `${id}-hint` : undefined}>
    <legend>{legend}</legend>
    {hint && <p id={`${id}-hint`} className="oq-kit-muted">{hint}</p>}
    <div className="oq-kit-choices__grid">{options.map(option => <label key={option.value} className="oq-kit-choice">
      <input type="radio" name={name ?? id} value={option.value} checked={value === option.value}
        disabled={option.disabled} onChange={() => onChange(option.value)} />
      <span className="oq-kit-choice__body">
        {option.image && <span className="oq-kit-choice__image">{option.image}</span>}
        <span className="oq-kit-choice__label">{option.label}<span className="oq-kit-choice__check" aria-hidden="true">{value === option.value ? "✓" : "○"}</span></span>
        <span className="oq-kit-choice__description">{option.description}</span>
      </span>
    </label>)}</div>
  </fieldset>;
}
export const LookChoiceTiles = ChoiceTiles;
export const AdventureChoiceTiles = ChoiceTiles;
