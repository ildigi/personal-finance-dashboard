import {
  Building2,
  CreditCard,
  LineChart,
  PiggyBank,
  RefreshCw,
  ServerCrash,
  Wallet,
} from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import type { Account, Health } from "@/api/client";
import { EmptyState } from "@/components/common/EmptyState";
import { Money } from "@/components/common/Money";
import { StatusIndicator, type Status } from "@/components/common/StatusIndicator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BudgetOverviewCard,
  UpcomingChargesCard,
} from "@/features/budgets/components/PlanningCards";
import { AlertsCard } from "@/features/overview/AlertsCard";
import { NetWorthTrendCard, OverviewTiles } from "@/features/overview/OverviewTiles";
import { useAccounts, useHealth } from "@/features/system/queries";
import { i18n } from "@/i18n";
import { formatDate, formatRelative, maskIban } from "@/lib/format";
import { todayInRome } from "@/lib/period";
import { cn } from "@/lib/utils";

function greeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("it-IT", {
      hour: "numeric",
      hour12: false,
      timeZone: "Europe/Rome",
    }).format(now),
  );
  if (hour < 5) return i18n.t("overview.greeting.night");
  if (hour < 13) return i18n.t("overview.greeting.morning");
  if (hour < 18) return i18n.t("overview.greeting.afternoon");
  return i18n.t("overview.greeting.evening");
}

export function OverviewPage() {
  const health = useHealth();
  const unreachable = health.isError;

  return (
    <div className="space-y-6 lg:space-y-8">
      <section>
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {formatDate(todayInRome(), "long")}
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{greeting()}</h2>
      </section>

      {unreachable && <BackendDownBanner onRetry={() => void health.refetch()} />}

      <OverviewTiles />

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <NetWorthTrendCard className="lg:col-span-2" />
        <AlertsCard />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:gap-6">
        <BudgetOverviewCard />
        <UpcomingChargesCard />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <AccountsCard className="lg:col-span-2" />
        <SystemCard
          health={health.data}
          isPending={health.isPending}
          isError={unreachable}
          updatedAt={health.dataUpdatedAt}
          onRefresh={() => void health.refetch()}
          refreshing={health.isFetching}
        />
      </div>
    </div>
  );
}

function BackendDownBanner({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-status-critical/30 bg-status-critical/5 p-4 sm:flex-row sm:items-center"
    >
      <ServerCrash aria-hidden className="size-5 shrink-0 text-status-critical" />
      <div className="flex-1 text-sm">
        <p className="font-medium">{t("overview.backendDown.title")}</p>
        <p className="text-muted-foreground">
          <Trans
            i18nKey="overview.backendDown.hint"
            components={{ code: <code className="rounded bg-muted px-1 py-0.5 text-xs" /> }}
          />
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} className="self-start sm:self-auto">
        <RefreshCw aria-hidden /> {t("overview.backendDown.retry")}
      </Button>
    </div>
  );
}

// --- Conti ------------------------------------------------------------------------------

/** Etichette in `accountTypes.<tipo>`. */
const ACCOUNT_ICON: Record<Account["type"], typeof Wallet> = {
  checking: Building2,
  savings: PiggyBank,
  card: CreditCard,
  credit_card: CreditCard,
  broker: LineChart,
};

function AccountsCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { data: accounts, isPending, isError } = useAccounts();

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t("overview.accounts.title")}</CardTitle>
        <CardDescription>{t("overview.accounts.description")}</CardDescription>
        {accounts && accounts.length > 0 && (
          <CardAction>
            <Badge variant="secondary">{accounts.length}</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {isPending ? (
          <div className="space-y-3" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("overview.accounts.error")}
          </p>
        ) : accounts.length === 0 ? (
          <EmptyState icon={Wallet} title={t("overview.accounts.emptyTitle")}>
            {t("overview.accounts.empty")}
          </EmptyState>
        ) : (
          <ul className="-mx-2 divide-y">
            {accounts.map((account) => (
              <AccountRow key={account.id} account={account} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AccountRow({ account }: { account: Account }) {
  const { t } = useTranslation();
  const Icon = ACCOUNT_ICON[account.type];
  return (
    <li className="flex items-center gap-3 px-2 py-3">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
        style={account.color ? { backgroundColor: account.color, color: "#fff" } : undefined}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{account.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {account.institution} · {t(`accountTypes.${account.type}`)}
          {account.iban && (
            <span data-sensitive className="num">
              {" · "}
              {maskIban(account.iban)}
            </span>
          )}
        </p>
      </div>
      {account.balance !== null ? (
        <div className="text-right">
          <Money
            value={account.balance}
            currency={account.currency}
            className="num text-sm font-medium"
          />
          {account.balance_as_of && (
            <div className="text-xs text-muted-foreground">
              {t(
                account.balance_type === "booked"
                  ? "overview.accounts.booked"
                  : "overview.accounts.available",
                { date: formatDate(account.balance_as_of, "short") },
              )}
            </div>
          )}
        </div>
      ) : (
        <Badge variant="outline" className="num">
          {account.currency}
        </Badge>
      )}
    </li>
  );
}

// --- Stato del sistema ---------------------------------------------------------------------

interface SystemCardProps {
  health: Health | undefined;
  isPending: boolean;
  isError: boolean;
  updatedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
}

function SystemCard({
  health,
  isPending,
  isError,
  updatedAt,
  refreshing,
  onRefresh,
}: SystemCardProps) {
  const { t } = useTranslation();
  const rows: { label: string; status: Status; value: string }[] = isError
    ? [
        {
          label: t("overview.system.backend"),
          status: "critical",
          value: t("overview.system.unreachable"),
        },
      ]
    : health
      ? [
          {
            label: t("overview.system.backend"),
            status: "good",
            value: t("overview.system.operational"),
          },
          {
            label: t("overview.system.database"),
            status: health.database.ok ? "good" : "critical",
            value: health.database.ok
              ? t("overview.system.connected")
              : t("overview.system.unreachable"),
          },
          {
            label: t("overview.system.schema"),
            status: health.database.up_to_date ? "good" : "warning",
            value: health.database.up_to_date
              ? t("overview.system.upToDate")
              : t("overview.system.migrationsPending"),
          },
        ]
      : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("overview.system.title")}</CardTitle>
        <CardDescription>
          {updatedAt > 0
            ? t("overview.system.checked", { when: formatRelative(new Date(updatedAt)) })
            : t("overview.system.checking")}
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRefresh}
            aria-label={t("overview.system.recheck")}
          >
            <RefreshCw aria-hidden className={cn(refreshing && "animate-spin")} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : (
          <dl className="space-y-3">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <dt className="text-sm text-muted-foreground">{row.label}</dt>
                <dd>
                  <StatusIndicator status={row.status} label={row.value} />
                </dd>
              </div>
            ))}
            {health && (
              <div className="flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                <span>{t("overview.system.version", { version: health.version })}</span>
                <span className="num">
                  {health.environment === "local" ? t("overview.system.local") : health.environment}
                  {health.database.migration_current &&
                    ` · ${health.database.migration_current.slice(0, 7)}`}
                </span>
              </div>
            )}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
