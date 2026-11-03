import { PieChart } from "lucide-react";

import { Money } from "@/components/common/Money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent } from "@/lib/format";

import type { InvestmentPie } from "../queries";
import { i18n } from "@/i18n";

/**
 * Una Pie: valore, investito, risultato (non annualizzato) e, per ogni strumento, il peso
 * attuale rispetto all'obiettivo (barra = attuale, tacca = obiettivo).
 */
export function PieCard({ pie }: { pie: InvestmentPie }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChart aria-hidden className="size-4 text-muted-foreground" />
          {i18n.t("investments.pie.title", { name: pie.name })}
        </CardTitle>
        <CardDescription>
          {pie.dividend_action === "REINVEST"
            ? i18n.t("investments.pie.reinvest")
            : pie.dividend_action === "TO_ACCOUNT_CASH"
              ? i18n.t("investments.pie.toCash")
              : i18n.t("investments.pie.composition")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">
              {i18n.t("investments.positions.value")}
            </dt>
            <dd className="font-medium">
              <Money value={pie.value_eur} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{i18n.t("investments.pie.invested")}</dt>
            <dd>
              <Money value={pie.invested_eur} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {i18n.t("investments.positions.result")}
            </dt>
            <dd>
              <Money value={pie.result_eur} signed tone="auto" />
              {pie.result_pct !== null && (
                <span className="ml-1 text-xs text-muted-foreground">
                  {formatPercent(pie.result_pct / 100, { signed: true })}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {i18n.t("investments.pie.cashToInvest")}
            </dt>
            <dd>
              <Money value={pie.cash_eur} />
            </dd>
          </div>
        </dl>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{i18n.t("investments.pie.weights")}</span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-0.5 bg-foreground/60" />{" "}
              {i18n.t("investments.pie.target")}
            </span>
          </div>
          <ul className="space-y-3">
            {pie.instruments.map((i) => {
              const drift = i.current_share_pct - i.expected_share_pct;
              return (
                <li key={i.ticker} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      {i.name ?? i.ticker}
                      <span className="ml-1.5 text-xs text-muted-foreground">{i.ticker}</span>
                    </span>
                    <span className="text-xs whitespace-nowrap text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {formatPercent(i.current_share_pct / 100)}
                      </span>{" "}
                      {i18n.t("investments.pie.ofTarget", {
                        pct: formatPercent(i.expected_share_pct / 100),
                      })}
                      {Math.abs(drift) >= 0.5 && (
                        <> ({formatPercent(drift / 100, { signed: true })})</>
                      )}
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={i18n.t("investments.pie.bar", {
                      name: i.name ?? i.ticker,
                      current: formatPercent(i.current_share_pct / 100),
                      target: formatPercent(i.expected_share_pct / 100),
                    })}
                    className="relative h-2 rounded-full bg-primary/15"
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${String(Math.min(i.current_share_pct, 100))}%` }}
                    />
                    <span
                      aria-hidden
                      className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-foreground/60"
                      style={{
                        left: `calc(${String(Math.min(i.expected_share_pct, 100))}% - 1px)`,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
