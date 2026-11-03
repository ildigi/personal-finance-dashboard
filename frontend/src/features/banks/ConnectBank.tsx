import { Landmark, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { intlLocale } from "@/i18n";

import { useAuthorizeBank, useBanks, useBanksStatus } from "./queries";

/**
 * Paesi più utili: Revolut può comparire sotto la Lituania (sede della banca). I nomi li dà
 * Intl nella lingua dell'interfaccia.
 */
const COUNTRIES = ["IT", "LT", "IE", "DE", "FR", "ES"];

/**
 * Collegamento di una banca via Open Banking (Enable Banking): si sceglie la banca, si
 * autorizza nell'app della banca, si torna qui. Solo lettura dei conti, nessun pagamento.
 */
export function ConnectBank() {
  const { t } = useTranslation();
  const status = useBanksStatus();
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState("IT");
  const [query, setQuery] = useState("");
  const banks = useBanks(country, open && status.data?.credentials_found === true);
  const authorize = useAuthorizeBank();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (banks.data ?? []).filter((b) => !q || b.name.toLowerCase().includes(q));
  }, [banks.data, query]);

  if (!status.data) return null;
  const countryName = new Intl.DisplayNames([intlLocale()], { type: "region" });
  const sandbox = status.data.environment === "sandbox";

  return (
    <div className="rounded-xl border border-dashed p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{t("banks.title")}</p>
        {sandbox && <Badge variant="outline">{t("banks.sandbox")}</Badge>}
      </div>
      {!status.data.credentials_found ? (
        <p className="mt-1 text-muted-foreground">
          <Trans
            i18nKey="banks.missingCredentials"
            components={{ code: <code className="rounded bg-muted px-1 py-0.5 text-xs" /> }}
          />
        </p>
      ) : (
        <>
          <p className="mt-1 text-muted-foreground">{t("banks.intro")}</p>
          {!open ? (
            <Button
              className="mt-3"
              size="sm"
              onClick={() => {
                setOpen(true);
              }}
            >
              {t("banks.connectBank")}
            </Button>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger aria-label={t("banks.country")} className="w-36 bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {countryName.of(code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative min-w-48 flex-1">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    aria-label={t("banks.search")}
                    placeholder={t("banks.search")}
                    className="pl-8"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                    }}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    setOpen(false);
                  }}
                >
                  {t("common.cancel")}
                </Button>
              </div>
              {banks.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : banks.isError ? (
                <p className="text-destructive">{banks.error.message}</p>
              ) : filtered.length === 0 ? (
                <p className="text-muted-foreground">{t("banks.noBanks")}</p>
              ) : (
                <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
                  {filtered.map((bank) => (
                    <li key={bank.name} className="flex items-center gap-3 px-3 py-2">
                      <Landmark aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{bank.name}</span>
                      {bank.beta && <Badge variant="outline">{t("banks.beta")}</Badge>}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={authorize.isPending}
                        onClick={() => {
                          authorize.mutate({ aspsp_name: bank.name, country });
                        }}
                        aria-label={t("banks.connectNamed", { name: bank.name })}
                      >
                        {t("banks.connect")}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {authorize.isPending && (
                <p role="status" className="text-muted-foreground">
                  {t("banks.opening")}
                </p>
              )}
              {authorize.isError && <p className="text-destructive">{authorize.error.message}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
