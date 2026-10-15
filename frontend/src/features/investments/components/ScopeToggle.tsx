import type { InvestmentScope } from "@/lib/preferences";
import { cn } from "@/lib/utils";

/**
 * "Tutto": rendimento di tutto ciò che hai investito dalla data di inizio, anche già venduto.
 * "Solo attivi": le posizioni in mano (valore − costo), come il risultato della Pie nell'app.
 */
export function ScopeToggle({
  value,
  onChange,
  allLabel,
}: {
  value: InvestmentScope;
  onChange: (value: InvestmentScope) => void;
  allLabel: string;
}) {
  const options: { key: InvestmentScope; label: string }[] = [
    { key: "all", label: allLabel },
    { key: "active", label: "Solo attivi" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Cosa conteggiare"
      className="flex rounded-lg border bg-card p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => {
            onChange(o.key);
          }}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === o.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
