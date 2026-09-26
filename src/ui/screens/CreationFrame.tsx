import type { ReactNode } from "react";
import type { StyleId } from "@shared/index.js";
import { Button, WorldStyleScope } from "../components/index.js";
import "./creation.css";

const steps = ["Photo", "Look", "Biome", "Preview", "World"] as const;

export function CreationFrame({
  activeStep,
  title,
  eyebrow,
  onBack,
  style = "cartoon",
  children,
}: {
  activeStep: 0 | 1 | 2 | 3 | 4;
  title: string;
  eyebrow?: string;
  onBack?: () => void;
  style?: StyleId;
  children: ReactNode;
}) {
  return (
    <WorldStyleScope worldStyle={style} className="oq-creation">
      <main className="oq-creation__container">
        <header className="oq-creation__header">
          <div className="oq-creation__topline">
            {onBack ? <Button variant="ghost" onClick={onBack}>← Back</Button> : <span />}
            <ol className="oq-creation__progress" aria-label="Creation progress">
              {steps.map((step, index) => (
                <li key={step} aria-current={index === activeStep ? "step" : undefined} data-complete={index < activeStep || undefined}>
                  <span aria-hidden="true">{index < activeStep ? "✓" : index + 1}</span>{step}
                </li>
              ))}
            </ol>
          </div>
          <div className="oq-creation__heading">
            {eyebrow ? <p className="oq-kit-eyebrow">{eyebrow}</p> : null}
            <h1>{title}</h1>
          </div>
        </header>
        {children}
      </main>
    </WorldStyleScope>
  );
}

