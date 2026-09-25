import type { SVGProps } from "react";
const paths = {
  arrow: "M4 12h16m-6-6 6 6-6 6",
  play: "m9 5 11 7-11 7V5Z",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  photo: "M4 4h16v16H4V4Zm0 12 5-5 4 4 3-3 4 4M15 8h.01",
  close: "m6 6 12 12M6 18 18 6",
  sound: "m11 4-6 5H2v6h3l6 5V4Zm4 4c3 2 3 6 0 8m3-11c5 4 5 10 0 14",
  pause: "M9 5v14m6-14v14",
  record: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z",
  worlds: "M4 5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm9 0a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V5ZM4 14a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Zm9 0a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5Z",
  plus: "M12 5v14M5 12h14",
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5 5-2Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c1-4 4-6 7-6s6 2 7 6",
  signOut: "M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10",
  import: "M12 4v11m-4-4 4 4 4-4M5 20h14",
} as const;
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return <svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
