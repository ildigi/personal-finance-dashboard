/**
 * Formattazione it-IT di importi, percentuali e date.
 *
 * Gli importi arrivano dall'API come stringhe decimali ("-1234.56"): vengono
 * passati così a Intl.NumberFormat (ES2023), senza conversione a float.
 */

export const LOCALE = "it-IT";
export const TIME_ZONE = "Europe/Rome";

export type Decimalish = string | number;

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string, signed: boolean, compact: boolean): Intl.NumberFormat {
  const key = `${currency}|${String(signed)}|${String(compact)}`;
  let formatter = moneyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      // In it-IT il CLDR non raggruppa sotto le 5 cifre ("1234,56 €"): la SPEC vuole "1.234,56 €".
      useGrouping: "always",
      signDisplay: signed ? "exceptZero" : "auto",
      ...(compact
        ? { notation: "compact", maximumFractionDigits: 1 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    });
    moneyFormatters.set(key, formatter);
  }
  return formatter;
}

function asNumeric(value: Decimalish): Intl.StringNumericLiteral | number {
  return typeof value === "number" ? value : (value.trim() as Intl.StringNumericLiteral);
}

/** `-1234.5` → `-1.234,50 €`; con `signed` anche `+12,00 €`; con `compact` `12,9 Mln €`. */
export function formatMoney(
  value: Decimalish,
  currency = "EUR",
  { signed = false, compact = false }: { signed?: boolean; compact?: boolean } = {},
): string {
  return moneyFormatter(currency, signed, compact).format(asNumeric(value));
}

/** Segno di un decimale in stringa senza passare dai float. */
export function sign(value: Decimalish): -1 | 0 | 1 {
  if (typeof value === "number") return value > 0 ? 1 : value < 0 ? -1 : 0;
  const v = value.trim();
  if (/^[-+]?0*(\.0*)?$/.test(v)) return 0;
  return v.startsWith("-") ? -1 : 1;
}

/** `0.153` → `15,3%`. */
export function formatPercent(
  ratio: number,
  { signed = false, digits = 1 }: { signed?: boolean; digits?: number } = {},
): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(ratio);
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat(LOCALE, { useGrouping: "always" }).format(value);
}

/** Data contabile ("2026-09-10") → "10 set 2026". Nessuno slittamento di fuso. */
export function formatDate(isoDate: string, style: "short" | "medium" | "long" = "medium"): string {
  const options: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "numeric", month: "short" }
      : style === "long"
        ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
        : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: "UTC" }).format(
    new Date(`${isoDate}T12:00:00Z`),
  );
}

/** Timestamp UTC dell'API → data e ora a Roma: "5 ott 2026, 14:03". */
export function formatDateTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(isoTimestamp));
}

/** "3 minuti fa", "ieri", "tra 2 giorni". */
export function formatRelative(target: Date, now: Date = new Date()): string {
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  const seconds = Math.round((target.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "adesso";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86_400), "day");
}

/** IBAN in vista: `IT00 •••• •••• 0000`. Il valore completo non viene mai mostrato. */
export function maskIban(iban: string): string {
  const compact = iban.replace(/\s+/g, "").toUpperCase();
  if (compact.length < 8) return "••••";
  return `${compact.slice(0, 4)} •••• •••• ${compact.slice(-4)}`;
}

/**
 * Importo scritto dall'utente → stringa decimale per l'API, o null se non valido.
 * Accetta "12,50", "12.50", "1.234,56", "1234", "€ 12,5". Sempre positivo: il segno
 * lo decide il tipo (uscita/entrata) scelto nel form.
 */
export function parseAmountInput(input: string): string | null {
  let value = input.replace(/[\s€]/g, "");
  if (value === "") return null;
  if (value.includes(",") && value.includes(".")) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (value.includes(",")) {
    value = value.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(value)) {
    value = value.replace(/\./g, ""); // "1.234" = milleduecentotrentaquattro
  }
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) return null;
  const [int = "0", dec = ""] = value.split(".");
  const normalized = `${String(Number(int))}.${dec.padEnd(2, "0")}`;
  return normalized === "0.00" ? null : normalized;
}

/** Intestazione di un gruppo di movimenti: "Oggi", "Ieri", "lunedì 14 settembre". */
export function formatDayHeading(isoDate: string, today: string): string {
  if (isoDate === today) return "Oggi";
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (isoDate === yesterday.toISOString().slice(0, 10)) return "Ieri";
  const sameYear = isoDate.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

/** Etichette brevi per gli assi dei grafici: "1,2 mila €". */
export function formatAxisMoney(value: number): string {
  return formatMoney(value, "EUR", { compact: true });
}

/** Mese "2026-09" → "set" / "set 2026" / "settembre 2026". */
export function formatMonth(month: string, style: "short" | "medium" | "long" = "medium"): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 15));
  const options: Intl.DateTimeFormatOptions =
    style === "short"
      ? { month: "short" }
      : style === "medium"
        ? { month: "short", year: "numeric" }
        : { month: "long", year: "numeric" };
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: "UTC" })
    .format(date)
    .replace(".", "");
}

/** Data breve per scadenze: "Oggi", "Domani", "sab 10 ott" (con l'anno se non è quello di oggi). */
export function formatDueDay(isoDate: string, today: string): string {
  if (isoDate === today) return "Oggi";
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (isoDate === tomorrow.toISOString().slice(0, 10)) return "Domani";
  const sameYear = isoDate.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  })
    .format(new Date(`${isoDate}T12:00:00Z`))
    .replace(/\./g, "");
}
