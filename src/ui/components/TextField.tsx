import { forwardRef, useId, type InputHTMLAttributes } from "react";
import "./kit.css";
export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  error?: string;
}
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, helperText, error, id: providedId, className = "", "aria-describedby": describedBy, ...props }, ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const description = [describedBy, helperText && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return <div className={`oq-kit-field ${className}`}>
    <label htmlFor={id}>{label}</label>
    <input {...props} id={id} ref={ref} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={description} />
    {helperText && <p id={`${id}-hint`} className="oq-kit-muted">{helperText}</p>}
    {error && <p id={`${id}-error`} className="oq-kit-error" role="alert">{error}</p>}
  </div>;
});
