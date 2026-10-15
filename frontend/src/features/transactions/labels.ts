import type { Schemas } from "@/api/client";

export type TransactionKind = Schemas["TransactionKind"];
export type ClassificationSource = Schemas["ClassificationSource"];

export const KIND_LABELS: Record<TransactionKind, string> = {
  expense: "Spesa",
  income: "Entrata",
  internal_transfer: "Trasferimento interno",
  investment_transfer: "Investimento",
  refund: "Rimborso",
  fee: "Commissione",
  other: "Altro",
};

export const SOURCE_LABELS: Record<ClassificationSource, string> = {
  manual: "Correzione manuale",
  rule: "Regola",
  merchant: "Merchant",
  provider: "Categoria della banca",
  heuristic: "Riconoscimento automatico",
  none: "Non ancora classificato",
};

export const STATUS_LABELS = { booked: "Contabilizzato", pending: "In sospeso" } as const;
