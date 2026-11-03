import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { i18n } from "@/i18n";

import {
  formatCount,
  formatDate,
  formatDayHeading,
  formatDateTime,
  formatDueDay,
  formatMoney,
  formatMonth,
  formatPercent,
  formatQuantity,
  formatRelative,
  maskIban,
  parseAmountInput,
  sign,
} from "./format";

// Intl usa spazi speciali (U+00A0, U+202F): normalizzati per confronti leggibili.
const plain = (s: string): string => s.replace(/[\u00a0\u202f]/g, " ");

describe("formatMoney", () => {
  it("formatta in it-IT con separatori italiani", () => {
    expect(plain(formatMoney("1234.56"))).toBe("1.234,56 €");
    expect(plain(formatMoney("-12.5"))).toBe("-12,50 €");
    expect(plain(formatMoney("0"))).toBe("0,00 €");
  });

  it("non perde precisione con importi grandi passati come stringa", () => {
    expect(plain(formatMoney("123456789012.34"))).toBe("123.456.789.012,34 €");
    expect(plain(formatMoney("0.10"))).toBe("0,10 €");
  });

  it("mostra il segno quando richiesto", () => {
    expect(plain(formatMoney("12", "EUR", { signed: true }))).toBe("+12,00 €");
    expect(plain(formatMoney("-12", "EUR", { signed: true }))).toBe("-12,00 €");
    expect(plain(formatMoney("0", "EUR", { signed: true }))).toBe("0,00 €");
  });

  it("supporta altre valute e la forma compatta", () => {
    expect(plain(formatMoney("-20", "USD"))).toBe("-20,00 USD");
    expect(plain(formatMoney("12900", "EUR", { compact: true }))).toMatch(/^12,9\s?.*€$/);
  });
});

describe("formatCount", () => {
  it("raggruppa anche le migliaia a 4 cifre", () => {
    expect(formatCount(1284)).toBe("1.284");
  });
});

describe("sign", () => {
  it.each([
    ["-0.01", -1],
    ["0.00", 0],
    ["-0", 0],
    ["+3", 1],
    ["15.20", 1],
    [-2, -1],
  ] as const)("%s → %i", (value, expected) => {
    expect(sign(value)).toBe(expected);
  });
});

describe("formatPercent", () => {
  it("usa la virgola decimale", () => {
    expect(plain(formatPercent(0.153))).toBe("15,3%");
    expect(plain(formatPercent(0.05, { signed: true }))).toBe("+5,0%");
  });
});

describe("date", () => {
  it("formatta le date contabili senza slittamenti di fuso", () => {
    expect(formatDate("2026-09-10")).toBe("10 set 2026");
    expect(formatDate("2026-01-01", "short")).toBe("1 gen");
    expect(formatDate("2026-10-05", "long")).toBe("lunedì 5 ottobre 2026");
  });

  it("converte i timestamp UTC nell'ora di Roma", () => {
    // 22:30 UTC del 4 ottobre = 00:30 del 5 ottobre a Roma (ora legale).
    expect(formatDateTime("2026-10-04T22:30:00Z")).toBe("5 ott 2026, 00:30");
  });

  it("descrive i tempi relativi", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(formatRelative(new Date("2026-10-05T11:59:50Z"), now)).toBe("adesso");
    expect(formatRelative(new Date("2026-10-05T11:57:00Z"), now)).toBe("3 minuti fa");
    expect(formatRelative(new Date("2026-10-04T12:00:00Z"), now)).toBe("ieri");
  });
});

describe("maskIban", () => {
  it("mostra solo paese e ultime cifre", () => {
    expect(maskIban("IT00X0000000000000000000000")).toBe("IT00 •••• •••• 0000");
    expect(maskIban("it00 x000 0000 0000 0000 0000 123")).toBe("IT00 •••• •••• 0123");
    expect(maskIban("abc")).toBe("••••");
  });
});

describe("parseAmountInput", () => {
  it.each([
    ["12,50", "12.50"],
    ["12.5", "12.50"],
    ["1.234,56", "1234.56"],
    ["1.234", "1234.00"],
    ["€ 7", "7.00"],
    ["0,99", "0.99"],
    ["  1234  ", "1234.00"],
    ["1.234,56 €", "1234.56"],
  ])("%s → %s", (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each(["", "abc", "12,345", "-5", "0", "0,00", "1,2,3"])("rifiuta %j", (input) => {
    expect(parseAmountInput(input)).toBeNull();
  });
});

describe("formatDayHeading", () => {
  it("usa Oggi, Ieri e il giorno della settimana", () => {
    expect(formatDayHeading("2026-10-05", "2026-10-05")).toBe("Oggi");
    expect(formatDayHeading("2026-10-04", "2026-10-05")).toBe("Ieri");
    expect(formatDayHeading("2026-09-14", "2026-10-05")).toBe("lunedì 14 settembre");
    expect(formatDayHeading("2025-12-24", "2026-10-05")).toBe("mercoledì 24 dicembre 2025");
  });
});

describe("in inglese (en-GB)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });
  afterEach(async () => {
    await i18n.changeLanguage("it");
  });

  it("formatta importi in euro con i separatori inglesi", () => {
    expect(plain(formatMoney("1234.56"))).toBe("€1,234.56");
    expect(plain(formatMoney("-12.5"))).toBe("-€12.50");
    expect(plain(formatMoney("12", "EUR", { signed: true }))).toBe("+€12.00");
    expect(plain(formatMoney("12900", "EUR", { compact: true }))).toBe("€12.9k");
    expect(formatCount(1284)).toBe("1,284");
    expect(plain(formatPercent(0.153))).toBe("15.3%");
    expect(formatQuantity("1234.5")).toBe("1,234.5");
  });

  it("formatta le date in inglese, sempre nel fuso di Roma", () => {
    expect(formatDate("2026-10-05")).toBe("5 Oct 2026");
    expect(formatDate("2026-10-05", "long")).toBe("Monday, 5 October 2026");
    expect(formatDateTime("2026-10-04T22:30:00Z")).toBe("5 Oct 2026, 00:30");
    expect(formatMonth("2026-09", "long")).toBe("September 2026");
  });

  it("usa le parole inglesi per i giorni vicini e i tempi relativi", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(formatRelative(new Date("2026-10-05T11:59:50Z"), now)).toBe("now");
    expect(formatRelative(new Date("2026-10-05T11:57:00Z"), now)).toBe("3 minutes ago");
    expect(formatDayHeading("2026-10-05", "2026-10-05")).toBe("Today");
    expect(formatDayHeading("2026-10-04", "2026-10-05")).toBe("Yesterday");
    expect(formatDueDay("2026-10-06", "2026-10-05")).toBe("Tomorrow");
  });

  it("legge gli importi scritti all'inglese", () => {
    expect(parseAmountInput("1,234.56")).toBe("1234.56");
    expect(parseAmountInput("1,234")).toBe("1234.00");
    expect(parseAmountInput("12.50")).toBe("12.50");
    expect(parseAmountInput("1.234")).toBeNull();
  });
});
