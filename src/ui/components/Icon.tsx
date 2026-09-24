import type { SVGProps } from "react";
const paths = {
  arrow: "M4 12h16m-6-6 6 6-6 6",
  play: "m9 5 11 7-11 7V5Z",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  photo: "M4 4h16v16H4V4Zm0 12 5-5 4 4 3-3 4 4M15 8h.01",
  close: "m6 6 12 12M6 18 18 6",
  sound: "m11 4-6 5H2v6h3l6 5V4Zm4 4c3 2 3 6 0 8m3-11c5 4 5 10 0 14",
} as const;
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
