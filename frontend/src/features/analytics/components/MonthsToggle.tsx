import { cn } from "@/lib/utils";
import { i18n } from "@/i18n";

/** Scelta dell'orizzonte di un grafico (es. 6 / 12 mesi). */
export function MonthsToggle({
  value,
  onChange,
  options,
}: {
  value: number;
  onChange: (value: number) => void;
  options: number[];
}) {
  return (
    <div
      role="radiogroup"
      aria-label={i18n.t("analytics.monthsShown")}
      className="flex rounded-lg border p-0.5"
    >
      {options.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => {
            onChange(n);
          }}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === n
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {i18n.t("analytics.months", { n })}
        </button>
      ))}
    </div>
  );
}
