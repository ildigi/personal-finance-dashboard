import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap, type Schemas } from "@/api/client";

export type Portfolio = Schemas["PortfolioRead"];
export type InvestmentSummary = Schemas["InvestmentSummary"];
export type InvestmentPosition = Schemas["PositionRead"];
export type InvestmentPie = Schemas["PieRead"];
export type InvestmentActivity = Schemas["InvestmentActivity"];
export type InvestmentMonth = Schemas["InvestmentMonth"];

export const investmentKeys = {
  all: ["investments"] as const,
  portfolios: ["investments", "portfolios"] as const,
  summary: (id: number) => ["investments", "summary", id] as const,
  activity: (id: number) => ["investments", "activity", id] as const,
  live: (id: number) => ["investments", "live", id] as const,
};

/** Ogni quanto chiedere valore e posizioni aggiornati con la pagina aperta. */
export const LIVE_REFRESH_MS = 15_000;

export function usePortfolios() {
  return useQuery({
    queryKey: investmentKeys.portfolios,
    queryFn: () => unwrap(api.GET("/api/investments/portfolios")),
  });
}

export function useInvestmentSummary(portfolioId: number | null) {
  return useQuery({
    queryKey: investmentKeys.summary(portfolioId ?? 0),
    queryFn: () =>
      unwrap(
        api.GET("/api/investments/{portfolio_id}/summary", {
          params: { path: { portfolio_id: portfolioId ?? 0 } },
        }),
      ),
    enabled: portfolioId !== null,
  });
}

export function useInvestmentActivity(portfolioId: number | null) {
  return useQuery({
    queryKey: investmentKeys.activity(portfolioId ?? 0),
    queryFn: () =>
      unwrap(
        api.GET("/api/investments/{portfolio_id}/activity", {
          params: { path: { portfolio_id: portfolioId ?? 0 }, query: { limit: 1000 } },
        }),
      ),
    enabled: portfolioId !== null,
  });
}

/** Data di inizio dei rendimenti (null = tutto lo storico): cambia tutti i numeri. */
export function useUpdateTrackingStart(portfolioId: number | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (trackingStart: string | null) =>
      unwrap(
        api.PATCH("/api/investments/{portfolio_id}", {
          params: { path: { portfolio_id: portfolioId ?? 0 } },
          body: { tracking_start: trackingStart },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: investmentKeys.all }),
  });
}

/**
 * Con la pagina aperta (e visibile), ogni 15 secondi chiede al backend di aggiornare valore,
 * liquidità e posizioni; se ci sono dati nuovi ricarica il riepilogo. Il backend limita le
 * chiamate al broker, quindi più schede aperte non sono un problema.
 */
export function useLiveRefresh(portfolioId: number | null, enabled: boolean) {
  const client = useQueryClient();
  return useQuery({
    queryKey: investmentKeys.live(portfolioId ?? 0),
    queryFn: async () => {
      const result = await unwrap(
        api.POST("/api/investments/{portfolio_id}/live", {
          params: { path: { portfolio_id: portfolioId ?? 0 } },
        }),
      );
      if (result.refreshed && portfolioId !== null) {
        await client.invalidateQueries({ queryKey: investmentKeys.summary(portfolioId) });
      }
      return result;
    },
    enabled: enabled && portfolioId !== null,
    refetchInterval: LIVE_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });
}
