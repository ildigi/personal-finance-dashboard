import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/api/client";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Non insistere se il backend è spento: lo stato lo mostra già la UI.
        // Né quando serve l'accesso: riprovare non cambierebbe nulla.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && (error.isUnreachable || error.status === 401)) &&
          failureCount < 1,
      },
    },
  });
}
