import type { it } from "./locales/it";

export type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/**
 * Forma dei messaggi, ricavata dall'italiano (il riferimento). `en.ts` la rispetta con
 * `satisfies`: una chiave mancante o in più è un errore di compilazione.
 */
export type Messages = Widen<typeof it>;
