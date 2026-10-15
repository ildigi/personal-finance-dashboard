import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Campo per scrivere un nome sul posto, al posto del testo che sostituisce: la larghezza segue
 * il contenuto (un testo invisibile identico fa da misura) e l'altezza la decide chi lo
 * contiene, così entrare e uscire dalla modifica non sposta nulla.
 *
 * Bordo e alone sono quelli di `Input` (`ring` è un'ombra: non cambia le misure); il riquadro
 * (altezza, bordo, padding) lo passa chi lo usa in `className`, uguale a quello del testo.
 *
 * Invio o uscire dal campo salvano, Esc annulla; un nome vuoto o invariato non salva.
 * Dopo Invio/Esc il focus torna a `returnFocus` (di solito il pulsante che ha aperto la modifica).
 */
export function InlineNameInput({
  initial = "",
  label,
  placeholder,
  id,
  leading,
  className,
  onCommit,
  onCancel,
  returnFocus,
}: {
  initial?: string;
  label: string;
  placeholder?: string;
  id?: string;
  leading?: ReactNode;
  className?: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
  returnFocus?: () => HTMLElement | null;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function finish(save: boolean, fromKeyboard: boolean): void {
    if (done.current) return;
    done.current = true;
    const name = value.trim();
    if (save && name && name !== initial) onCommit(name);
    else onCancel();
    if (fromKeyboard && returnFocus) {
      requestAnimationFrame(() => {
        returnFocus()?.focus();
      });
    }
  }

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center border-ring ring-[3px] ring-ring/50",
        className,
      )}
    >
      {leading}
      <span className="inline-grid min-w-0">
        <span
          aria-hidden
          className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre"
        >
          {value === "" ? (placeholder ?? " ") : value}
        </span>
        <input
          ref={ref}
          id={id}
          value={value}
          maxLength={100}
          placeholder={placeholder}
          aria-label={label}
          autoComplete="off"
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              finish(true, true);
            } else if (event.key === "Escape") {
              // Senza propagazione: Esc non deve chiudere anche un pannello che lo contiene.
              event.preventDefault();
              event.stopPropagation();
              finish(false, true);
            }
          }}
          onBlur={() => {
            finish(true, false);
          }}
          className="col-start-1 row-start-1 h-full w-full min-w-0 bg-transparent p-0 text-inherit outline-none placeholder:text-muted-foreground"
        />
      </span>
    </span>
  );
}
