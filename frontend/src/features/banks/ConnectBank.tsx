import { Landmark, Search } from "lucide-react";
import { useMemo, useState } from "react";

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

import { useAuthorizeBank, useBanks, useBanksStatus } from "./queries";

/** Paesi più utili: Revolut può comparire sotto la Lituania (sede della banca). */
const COUNTRIES = [
  { code: "IT", label: "Italia" },
  { code: "LT", label: "Lituania" },
  { code: "IE", label: "Irlanda" },
  { code: "DE", label: "Germania" },
  { code: "FR", label: "Francia" },
  { code: "ES", label: "Spagna" },
];

/**
 * Collegamento di una banca via Open Banking (Enable Banking): si sceglie la banca, si
 * autorizza nell'app della banca, si torna qui. Solo lettura dei conti, nessun pagamento.
 */
export function ConnectBank() {
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
  const sandbox = status.data.environment === "sandbox";

  return (
    <div className="rounded-xl border border-dashed p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">Banche (Open Banking)</p>
        {sandbox && <Badge variant="outline">Sandbox: solo banche di prova</Badge>}
      </div>
      {!status.data.credentials_found ? (
        <p className="mt-1 text-muted-foreground">
          Registra un'applicazione su Enable Banking e salva application ID e chiave privata nella
          cartella dei segreti (
          <code className="rounded bg-muted px-1 py-0.5 text-xs">secrets\enablebanking.env</code> e{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">enablebanking.pem</code>).
        </p>
      ) : (
        <>
          <p className="mt-1 text-muted-foreground">
            Autorizzi la lettura dei conti nell'app della tua banca: la dashboard non vede mai la
            password e non può fare pagamenti. Il consenso dura fino a 180 giorni.
          </p>
          {!open ? (
            <Button
              className="mt-3"
              size="sm"
              onClick={() => {
                setOpen(true);
              }}
            >
              Collega una banca
            </Button>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger aria-label="Paese della banca" className="w-36 bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label}
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
                    aria-label="Cerca la banca"
                    placeholder="Cerca la banca"
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
                  Annulla
                </Button>
              </div>
              {banks.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : banks.isError ? (
                <p className="text-destructive">{banks.error.message}</p>
              ) : filtered.length === 0 ? (
                <p className="text-muted-foreground">Nessuna banca trovata.</p>
              ) : (
                <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
                  {filtered.map((bank) => (
                    <li key={bank.name} className="flex items-center gap-3 px-3 py-2">
                      <Landmark aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{bank.name}</span>
                      {bank.beta && <Badge variant="outline">beta</Badge>}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={authorize.isPending}
                        onClick={() => {
                          authorize.mutate({ aspsp_name: bank.name, country });
                        }}
                        aria-label={`Collega ${bank.name}`}
                      >
                        Collega
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {authorize.isPending && (
                <p role="status" className="text-muted-foreground">
                  Apertura della pagina della banca…
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
