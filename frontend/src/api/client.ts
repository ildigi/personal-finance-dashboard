/**
 * Client tipizzato dell'API. I tipi sono generati dallo schema OpenAPI del backend
 * (`pnpm api:generate`): se il backend cambia, il frontend non compila finché
 * non viene allineato.
 */

import createClient from "openapi-fetch";

import { i18n } from "@/i18n";

import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type Health = Schemas["Health"];
export type Account = Schemas["AccountRead"];
export type Category = Schemas["CategoryRead"];
export type IncomeType = Schemas["IncomeClassificationRead"];

export const api = createClient<paths>({
  // Stessa origine: in sviluppo il proxy di Vite inoltra /api al backend.
  baseUrl: globalThis.location.origin,
  // Risolto a ogni chiamata (e non una volta sola), così i test possono sostituire fetch.
  fetch: (request) => globalThis.fetch(request),
});

/** Chi vuole sapere che la sessione non c'è più (scaduta o chiusa da un altro dispositivo). */
const unauthorizedListeners = new Set<() => void>();

export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

api.use({
  onResponse({ request, response }) {
    if (response.status === 401 && !new URL(request.url).pathname.startsWith("/api/auth/")) {
      for (const listener of unauthorizedListeners) listener();
    }
    return response;
  },
});

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  /** Backend spento o irraggiungibile (errore di rete o proxy senza destinazione). */
  get isUnreachable(): boolean {
    return this.status === 0 || this.status === 502 || this.status === 504;
  }
}

function detailOf(error: unknown): string | null {
  if (error && typeof error === "object" && "detail" in error) {
    const { detail } = error;
    if (typeof detail === "string") return detail;
  }
  return null;
}

/** Restituisce i dati o lancia `ApiError` con un messaggio leggibile. */
export async function unwrap<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: Awaited<typeof request>;
  try {
    result = await request;
  } catch {
    throw new ApiError(0, i18n.t("errors.backendUnreachable"));
  }
  const { data, error, response } = result;
  if (data !== undefined && response.ok) return data;
  throw new ApiError(
    response.status,
    detailOf(error) ?? i18n.t("errors.backendStatus", { status: response.status }),
  );
}
