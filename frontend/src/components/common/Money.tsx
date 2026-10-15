import { formatMoney, sign, type Decimalish } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MoneyProps {
  value: Decimalish;
  currency?: string;
  /** Mostra sempre il segno (+/−): utile per variazioni e movimenti. */
  signed?: boolean;
  compact?: boolean;
  /** "auto": entrate in verde, uscite in tinta normale. */
  tone?: "auto" | "none";
  className?: string;
}

/** Importo formattato it-IT. Sensibile: oscurato in modalità privacy. */
export function Money({
  value,
  currency = "EUR",
  signed = false,
  compact = false,
  tone = "none",
  className,
}: MoneyProps) {
  const positive = tone === "auto" && sign(value) > 0;
  return (
    <span
      data-sensitive
      className={cn("whitespace-nowrap", positive && "text-positive", className)}
    >
      {formatMoney(value, currency, { signed, compact })}
    </span>
  );
}
