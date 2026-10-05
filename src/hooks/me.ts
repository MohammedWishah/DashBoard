import { useQuery } from "@tanstack/react-query";
import type { Feature } from "@shared/features";
import { request } from "@/lib/api";

export type Me = { id: string; email: string; isAdmin: boolean; features: Feature[] };

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => request<Me>("/me"), staleTime: 60_000 });
}

/** True while loading too, so sections don't flash away before /me answers. */
export function useHasFeature(feature: Feature): boolean {
  const me = useMe();
  return me.data ? me.data.features.includes(feature) : true;
}
