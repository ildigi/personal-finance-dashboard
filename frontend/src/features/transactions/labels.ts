import type { Schemas } from "@/api/client";
import { i18n } from "@/i18n";

export type TransactionKind = Schemas["TransactionKind"];
export type ClassificationSource = Schemas["ClassificationSource"];

export const TRANSACTION_KINDS: TransactionKind[] = [
  "expense",
  "income",
  "internal_transfer",
  "investment_transfer",
  "refund",
  "fee",
  "other",
];

export const kindLabel = (kind: TransactionKind): string => i18n.t(`transactions.kind.${kind}`);

export const sourceLabel = (source: ClassificationSource): string =>
  i18n.t(`transactions.source.${source}`);

export const statusLabel = (status: "booked" | "pending"): string =>
  i18n.t(`transactions.status.${status}`);
