import { forwardRef, type ButtonHTMLAttributes } from "react";
import "./kit.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  loadingLabel?: string;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading = false, loadingLabel = "Working…", disabled, children, className = "", type = "button", ...props }, ref,
) {
  return <button {...props} ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
    className={`oq-kit-button oq-kit-button--${variant} ${className}`}>
    {loading && <span className="oq-kit-spinner" aria-hidden="true" />}
    {loading ? loadingLabel : children}
  </button>;
});
