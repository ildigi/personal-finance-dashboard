import { useId } from "react";

import { cn } from "@/lib/utils";

/** Logo: tessera blu con una linea di andamento. Stesso disegno della favicon. */
export function BrandMark({ className }: { className?: string }) {
  // Id unico: con due loghi nella pagina (uno nascosto) un id fisso non verrebbe disegnato.
  const gradientId = useId();
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3987e5" />
          <stop offset="1" stopColor="#1c5cab" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <path
        d="M8 21.5 13 16l4 3.5 7-8"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="11.5" r="2" fill="#fff" />
    </svg>
  );
}
