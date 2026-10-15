import { ArrowLeft } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";

import { BrandMark } from "@/components/common/BrandMark";

export const LEGAL_UPDATED = "6 ottobre 2026";

/**
 * Pagina di testo autonoma (privacy, termini), fuori dalla shell dell'app: può essere aperta
 * dalla schermata di consenso della banca, quindi niente sidebar né barra degli strumenti.
 */
export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Finanze`;
    window.scrollTo({ top: 0 });
  }, [title]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-prose items-center gap-3 px-4 py-4 sm:px-6">
          <BrandMark className="size-7" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
            Finanze — Dashboard personale
          </span>
          <Link
            to="/"
            className="inline-flex shrink-0 items-center gap-1 rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-prose px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ultimo aggiornamento: {LEGAL_UPDATED}</p>
        <div className="mt-8 space-y-8 leading-relaxed [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_p+p]:mt-3 [&_p+ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ul]:marker:text-muted-foreground [&_ul+p]:mt-3">
          {children}
        </div>
      </main>
    </div>
  );
}

/** Sezione con titolo di secondo livello. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
