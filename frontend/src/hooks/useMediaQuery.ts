import { useCallback, useSyncExternalStore } from "react";

/** Vero se la media query corrisponde; si aggiorna al ridimensionamento. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => {
        list.removeEventListener("change", onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsDesktop = (): boolean => useMediaQuery("(min-width: 1024px)");
