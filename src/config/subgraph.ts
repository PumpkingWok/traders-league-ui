const goldskySubgraphUrlDefault = (__GOLDSKY_SUBGRAPH_URL__ ?? '').trim();
const goldskySubgraphUrlByChainId = __GOLDSKY_SUBGRAPH_URL_BY_CHAIN_ID__ ?? {};

export function getGoldskySubgraphUrl(chainId: number): string {
  const perChain = goldskySubgraphUrlByChainId[String(chainId)]?.trim() ?? '';
  if (perChain) return perChain;
  return goldskySubgraphUrlDefault;
}
