/**
 * Testo dei messaggi che il backend manda come codice con parametri (ADR 0006): errori, log di
 * sincronizzazione, perché della classificazione. Un codice sconosciuto (backend più nuovo del
 * frontend) mostra il testo di ripiego o il codice stesso.
 */

import { formatDate } from "@/lib/format";

import { i18n } from "./index";

export type MessageParams = Record<string, unknown> | null | undefined;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Chiavi costruite dal codice: il controllo dei tipi non le conosce, il test sui codici sì.
const translate = i18n.t.bind(i18n) as unknown as (key: string, options?: object) => string;

/** Le date ISO nei parametri si mostrano nel formato della lingua. */
function displayParams(params: MessageParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    out[key] = typeof value === "string" && ISO_DATE.test(value) ? formatDate(value) : value;
  }
  return out;
}

export function hasMessage(code: string): boolean {
  return i18n.exists(`messages.${code}`);
}

export function messageText(
  code: string,
  params?: MessageParams,
  fallback?: string | null,
): string {
  if (hasMessage(code)) return translate(`messages.${code}`, displayParams(params));
  return fallback ?? code;
}
