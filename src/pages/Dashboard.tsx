import { useEffect, useMemo, useState } from 'react';
import { formatUnits, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts } from 'wagmi';
import { erc20MetadataAbi, hyperDuelAbi } from '../config/abis';
import { hyperDuelContractByChainId, tokenIndexByChainId, zeroAddress } from '../config/contracts';
import { getGoldskySubgraphUrl } from '../config/subgraph';
import { compactNumber, formatAddress, formatDurationFromSeconds } from '../utils/format';
import { JoinMatchModal } from '../components/JoinMatchModal';
import { type Match } from '../types/match';

const platformFeeBase = 10_000n;

type DashboardMatch = {
  id: bigint;
  playerA: Address;
  playerB: Address;
  winner: Address;
  buyIn: bigint;
  duration: bigint;
  endTs: bigint;
  status: number;
  tokensAllowed: number[];
};

const readBigInt = (value: unknown): bigint | null => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.length > 0) {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
};

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'bigint') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  if (typeof value === 'string' && value.length > 0) {
    if (value.startsWith('0x')) {
      const parsedHex = Number.parseInt(value, 16);
      return Number.isFinite(parsedHex) ? parsedHex : null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
};

const readAddress = (value: unknown): Address => {
  if (typeof value === 'string' && value.startsWith('0x') && value.length === 42) {
    return value as Address;
  }
  return zeroAddress;
};

const normalizeSubgraphTokenIds = (rawValue: unknown): number[] => {
  if (!Array.isArray(rawValue)) return [];
  return rawValue
    .map((tokenId) => readNumber(tokenId))
    .filter((tokenId): tokenId is number => tokenId !== null);
};

const normalizeSubgraphMatchRow = (raw: Record<string, unknown>): DashboardMatch | null => {
  const id = readBigInt(raw.matchId ?? raw.match_id ?? raw.id);
  if (id === null || id <= 0n) return null;

  return {
    id,
    playerA: readAddress(raw.playerA ?? raw.player_a),
    playerB: readAddress(raw.playerB ?? raw.player_b),
    winner: readAddress(raw.winner),
    buyIn: readBigInt(raw.buyIn ?? raw.buy_in) ?? 0n,
    duration: readBigInt(raw.duration) ?? 0n,
    endTs: readBigInt(raw.endTs ?? raw.end_ts ?? raw.endTime ?? raw.end_time) ?? 0n,
    status: readNumber(raw.status ?? raw.statusCode ?? raw.status_code) ?? 0,
    tokensAllowed: normalizeSubgraphTokenIds(raw.tokensAllowed ?? raw.tokens_allowed),
  };
};

const fetchMatchesFromSubgraph = async ({
  endpoint,
  limit,
}: {
  endpoint: string;
  limit: number;
}): Promise<DashboardMatch[] | null> => {
  const safeLimit = Math.max(1, limit);
  const attempts: Array<{ rootFieldName: string; query: string }> = [
    {
      rootFieldName: 'matches',
      query: `query MatchRows { matches(first: ${safeLimit}, orderBy: id, orderDirection: desc) { id matchId playerA playerB winner buyIn duration endTs status tokensAllowed } }`,
    },
    {
      rootFieldName: 'matches',
      query: `query MatchRows { matches(first: ${safeLimit}, orderBy: id, orderDirection: desc) { id match_id player_a player_b winner buy_in duration end_ts status tokens_allowed } }`,
    },
    {
      rootFieldName: 'matches',
      query: `query MatchRows { matches(first: ${safeLimit}, orderBy: id, orderDirection: desc) { id matchId playerA playerB winner buyIn duration endTs status } }`,
    },
    {
      rootFieldName: 'matches',
      query: `query MatchRows { matches(first: ${safeLimit}) { id matchId playerA playerB winner buyIn duration endTs status tokensAllowed } }`,
    },
  ];

  for (const attempt of attempts) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: attempt.query }),
    });
    if (!response.ok) continue;

    const json = (await response.json()) as { data?: Record<string, unknown>; errors?: Array<{ message?: string }> };
    if (json.errors?.length) continue;
    const rows = json.data?.[attempt.rootFieldName];
    if (!Array.isArray(rows)) continue;

    const normalized = rows
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        return normalizeSubgraphMatchRow(row as Record<string, unknown>);
      })
      .filter((row): row is DashboardMatch => row !== null);

    normalized.sort((a, b) => Number(b.id - a.id));
    return normalized;
  }

  return null;
};

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(1)}%`;
}

export default function DashboardPage() {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const subgraphMatchesUrl = getGoldskySubgraphUrl(chainId);
  const publicClient = usePublicClient();
  const hyperDuelContractAddress = hyperDuelContractByChainId[chainId];
  const tokenIndexMap = tokenIndexByChainId[chainId] ?? {};

  const [matches, setMatches] = useState<DashboardMatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchesReloadNonce, setMatchesReloadNonce] = useState(0);
  const [selectedReservedMatchToJoin, setSelectedReservedMatchToJoin] = useState<Match | null>(null);

  const { data: latestMatchIdData } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'matchId',
    query: {
      enabled: Boolean(hyperDuelContractAddress && isConnected && address),
    },
  });

  const { data: buyInTokenAddressData } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'buyInToken',
    query: {
      enabled: Boolean(hyperDuelContractAddress),
    },
  });

  const { data: buyInTokenMetadata } = useReadContracts({
    contracts: buyInTokenAddressData
      ? [
          {
            address: buyInTokenAddressData as Address,
            abi: erc20MetadataAbi,
            functionName: 'symbol',
          },
          {
            address: buyInTokenAddressData as Address,
            abi: erc20MetadataAbi,
            functionName: 'decimals',
          },
        ]
      : [],
    query: {
      enabled: Boolean(buyInTokenAddressData),
    },
  });

  const { data: platformFeeData } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'platformFee',
    query: {
      enabled: Boolean(hyperDuelContractAddress),
    },
  });

  const buyInTokenSymbol = (buyInTokenMetadata?.[0]?.result as string | undefined) ?? 'TOKEN';
  const buyInTokenDecimals = Number((buyInTokenMetadata?.[1]?.result as number | undefined) ?? 18);
  const platformFeeBps = (platformFeeData as bigint | undefined) ?? 0n;

  useEffect(() => {
    if (!isConnected || !address) {
      setMatches([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    if (!publicClient || !hyperDuelContractAddress || latestMatchIdData === undefined) return;

    const latestMatchId = Number(latestMatchIdData);
    if (!Number.isFinite(latestMatchId) || latestMatchId < 1) {
      setMatches([]);
      return;
    }

    let cancelled = false;
    const account = address.toLowerCase();

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchMatchesFromContract = async (): Promise<DashboardMatch[]> => {
          const ids = Array.from({ length: latestMatchId }, (_, index) => BigInt(index + 1));
          const results = await Promise.allSettled(
            ids.map(async (id) => {
              const match = (await publicClient.readContract({
                address: hyperDuelContractAddress,
                abi: hyperDuelAbi,
                functionName: 'matches',
                args: [id],
              })) as readonly [Address, Address, Address, bigint, bigint, bigint, number];

              let tokensAllowed: readonly number[] | readonly bigint[] = [];
              try {
                tokensAllowed = (await publicClient.readContract({
                  address: hyperDuelContractAddress,
                  abi: hyperDuelAbi,
                  functionName: 'getMatchTokensAllowed',
                  args: [id],
                })) as readonly number[] | readonly bigint[];
              } catch {
                tokensAllowed = [];
              }

              return {
                id,
                playerA: match[0],
                playerB: match[1],
                winner: match[2],
                buyIn: match[3],
                duration: match[4],
                endTs: match[5],
                status: Number(match[6]),
                tokensAllowed: tokensAllowed.map((tokenId) => Number(tokenId)),
              } satisfies DashboardMatch;
            }),
          );

          return results
            .filter((item): item is PromiseFulfilledResult<DashboardMatch> => item.status === 'fulfilled')
            .map((item) => item.value);
        };

        let records: DashboardMatch[] | null = null;
        if (subgraphMatchesUrl) {
          records = await fetchMatchesFromSubgraph({
            endpoint: subgraphMatchesUrl,
            limit: latestMatchId,
          });
        }

        if (!records || records.length === 0) {
          records = await fetchMatchesFromContract();
        }

        if (!cancelled) {
          const hydrated = records.filter((item) => {
            const playerA = item.playerA.toLowerCase();
            const playerB = item.playerB.toLowerCase();
            return playerA === account || playerB === account;
          });
          setMatches(hydrated);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setMatches([]);
          setError(fetchError instanceof Error ? fetchError.message : 'Could not load dashboard stats.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [address, hyperDuelContractAddress, isConnected, latestMatchIdData, matchesReloadNonce, publicClient]);

  const reservedInvites = useMemo(() => {
    const connectedAddress = address?.toLowerCase();
    if (!connectedAddress) return [];

    const tokenLabelById = Object.entries(tokenIndexMap).reduce<Record<number, string>>((accumulator, [label, id]) => {
      accumulator[id] = label;
      return accumulator;
    }, {});

    return matches
      .filter(
        (match) =>
          match.status === 0 &&
          match.playerA.toLowerCase() !== zeroAddress &&
          match.playerB.toLowerCase() === connectedAddress,
      )
      .sort((a, b) => Number(b.id - a.id))
      .map((match) => {
        const assetsLabel =
          match.tokensAllowed.length > 0
            ? match.tokensAllowed.map((tokenId) => tokenLabelById[tokenId] ?? `T${tokenId}`).join(' • ')
            : 'No assets';

        return {
          id: `#${match.id.toString()}`,
          matchId: match.id,
          buyInRaw: match.buyIn,
          assets: assetsLabel,
          buyIn: `${compactNumber(formatUnits(match.buyIn, buyInTokenDecimals))} ${buyInTokenSymbol}`,
          duration: formatDurationFromSeconds(match.duration),
          players: `${formatAddress(match.playerA)} vs You`,
          statusCode: match.status,
          status: 'To Start',
          winner: '-',
          canJoin: true,
        } satisfies Match;
      });
  }, [address, buyInTokenDecimals, buyInTokenSymbol, matches, tokenIndexMap]);

  const stats = useMemo(() => {
    const joined = matches.filter((match) => match.status !== 3);
    const ongoing = joined.filter((match) => match.status === 1);
    const concluded = joined.filter((match) => match.status === 2);

    const wins = concluded.filter((match) => match.winner.toLowerCase() === address?.toLowerCase()).length;
    const draws = concluded.filter((match) => match.winner.toLowerCase() === zeroAddress).length;
    const losses = concluded.length - wins - draws;
    const decidedMatches = wins + losses;

    const winRate = decidedMatches > 0 ? (wins / decidedMatches) * 100 : 0;
    const lossRate = decidedMatches > 0 ? (losses / decidedMatches) * 100 : 0;

    const netPrizeForWonMatch = (buyIn: bigint) => {
      const grossPrize = buyIn * 2n;
      const feeAmount = (grossPrize * platformFeeBps) / platformFeeBase;
      return grossPrize - feeAmount;
    };

    const realizedPayout = concluded.reduce((accumulator, match) => {
      const winner = match.winner.toLowerCase();
      const connected = address?.toLowerCase();
      if (winner === zeroAddress) {
        // Draw: each player gets their own buy-in back, and no platform fee is charged.
        return accumulator + match.buyIn;
      }
      if (winner !== connected) return accumulator;
      return accumulator + netPrizeForWonMatch(match.buyIn);
    }, 0n);

    const totalBuyIns = concluded.reduce((accumulator, match) => accumulator + match.buyIn, 0n);
    const pnl = realizedPayout - totalBuyIns;

    return {
      joined: joined.length,
      ongoing: ongoing.length,
      concluded: concluded.length,
      wins,
      losses,
      draws,
      winRate,
      lossRate,
      prizeWon: realizedPayout,
      pnl,
      recent: [...joined].sort((a, b) => Number(b.id - a.id)).slice(0, 8),
    };
  }, [address, matches, platformFeeBps]);

  if (!isConnected || !address) {
    return (
      <section className="space-y-6 text-[#2f2f2f]">
        <section className="border border-[#a8a8a8] bg-[#f4f4f4]">
          <div className="border-b border-[#bcbcbc] bg-[#ebebeb] px-4 py-3 md:px-6">
            <div className="font-mono text-lg font-black uppercase tracking-[0.08em] text-[#363636]">Dashboard</div>
          </div>
          <div className="px-4 py-4 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#9a4f4f] md:px-6 md:py-6">
            Connect your wallet to view player stats.
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="space-y-6 text-[#2f2f2f]">
      <section className="border border-[#a8a8a8] bg-[#f1f1f1]">
        <div className="h-1 w-full bg-[linear-gradient(90deg,#8f83ff_0%,#7ed8ff_50%,#8f83ff_100%)]" />
        <div className="px-4 py-6 md:px-8 md:py-7">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex border border-[#9d9d9d] bg-[#e7e7e7] px-3 py-1 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#525252]">
              Dashboard
            </div>
            <h1 className="font-mono text-3xl font-black uppercase tracking-[0.06em] text-[#2b2b2b] md:text-5xl">
              Player Overview
            </h1>
            <p className="font-mono text-sm font-bold leading-6 text-[#4d4d4d] md:text-base">
              Track your onchain performance across joined matches, results, prizes, and realized PnL.
            </p>
          </div>
        </div>
      </section>

      <section className="border border-[#a8a8a8] bg-[#f4f4f4]">
        <div className="border-b border-[#bcbcbc] bg-[#ebebeb] px-4 py-3 md:px-6">
          <div className="font-mono text-lg font-black uppercase tracking-[0.08em] text-[#363636]">Stats</div>
        </div>
        <div className="space-y-4 px-4 py-4 md:px-6 md:py-6">
          {isLoading ? (
            <div className="font-mono text-sm font-black uppercase tracking-[0.08em] text-[#5a5a5a]">Loading dashboard stats...</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="border border-[#b9b9b9] bg-[#f9f9f9] px-3 py-3">
                <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#666]">Matches Joined</div>
                <div className="mt-1 font-mono text-2xl font-black text-[#2f2f2f]">{stats.joined}</div>
                <div className="mt-1 font-mono text-[11px] font-bold text-[#666]">Ongoing: {stats.ongoing} • Concluded: {stats.concluded}</div>
              </div>
              <div className="border border-[#b9b9b9] bg-[#f9f9f9] px-3 py-3">
                <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#666]">Win vs Loss</div>
                <div className="mt-1 font-mono text-2xl font-black text-[#2f2f2f]">{stats.wins} / {stats.losses}</div>
                <div className="mt-1 font-mono text-[11px] font-bold text-[#666]">Draws: {stats.draws}</div>
              </div>
              <div className="border border-[#b9b9b9] bg-[#f9f9f9] px-3 py-3">
                <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#666]">Rate</div>
                <div className="mt-1 font-mono text-2xl font-black text-[#2f2f2f]">{formatPercent(stats.winRate)}</div>
                <div className="mt-1 font-mono text-[11px] font-bold text-[#666]">Loss rate: {formatPercent(stats.lossRate)}</div>
              </div>
              <div className="border border-[#b9b9b9] bg-[#f9f9f9] px-3 py-3">
                <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#666]">Prize Won</div>
                <div className="mt-1 font-mono text-xl font-black text-[#2f2f2f]">
                  {compactNumber(formatUnits(stats.prizeWon, buyInTokenDecimals))} {buyInTokenSymbol}
                </div>
                <div className="mt-1 font-mono text-[11px] font-bold text-[#666]">
                  PnL: {stats.pnl >= 0n ? '+' : ''}{compactNumber(formatUnits(stats.pnl, buyInTokenDecimals))} {buyInTokenSymbol}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {reservedInvites.length > 0 ? (
        <section className="border border-[#a8a8a8] bg-[#f4f4f4]">
          <div className="border-b border-[#bcbcbc] bg-[#ebebeb] px-4 py-3 md:px-6">
            <div className="font-mono text-lg font-black uppercase tracking-[0.08em] text-[#363636]">Reserved For You</div>
          </div>
          <div className="space-y-4 px-4 py-4 md:px-6 md:py-6">
            <div className="overflow-hidden border border-[#b8b8b8] bg-[#f9f9f9]">
              <div className="hidden grid-cols-[0.8fr_1.3fr_1.8fr_1fr_1fr_0.9fr] gap-4 border-b border-[#cfcfcf] bg-[#eeeeee] px-4 py-3 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5a5a5a] md:grid">
                <div>Match</div>
                <div>Players</div>
                <div>Assets</div>
                <div>Buy-in</div>
                <div>Duration</div>
                <div>Action</div>
              </div>
              <div className="divide-y divide-[#d3d3d3]">
                {reservedInvites.map((match) => (
                  <div
                    key={`dashboard-reserved-${match.id}`}
                    className="grid gap-4 bg-[#f9f9f9] px-4 py-4 font-mono text-sm font-bold text-[#3b3b3b] md:grid-cols-[0.8fr_1.3fr_1.8fr_1fr_1fr_0.9fr] md:items-center"
                  >
                    <div>{match.id}</div>
                    <div>{match.players}</div>
                    <div>{match.assets}</div>
                    <div>{match.buyIn}</div>
                    <div>{match.duration}</div>
                    <div>
                      <button
                        type="button"
                        className="border border-[#8f83ff] bg-[#ece9ff] px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#433d98] hover:bg-[#e3deff]"
                        onClick={() => setSelectedReservedMatchToJoin(match)}
                      >
                        Join
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="border border-[#a8a8a8] bg-[#f4f4f4]">
        <div className="border-b border-[#bcbcbc] bg-[#ebebeb] px-4 py-3 md:px-6">
          <div className="font-mono text-lg font-black uppercase tracking-[0.08em] text-[#363636]">Recent Matches</div>
        </div>
        <div className="space-y-4 px-4 py-4 md:px-6 md:py-6">
          {isLoading ? (
            <div className="font-mono text-sm font-black uppercase tracking-[0.08em] text-[#5a5a5a]">Loading recent matches...</div>
          ) : stats.recent.length === 0 ? (
            <div className="font-mono text-sm font-black uppercase tracking-[0.08em] text-[#6b6b6b]">No matches yet.</div>
          ) : (
            <div className="overflow-hidden border border-[#b8b8b8] bg-[#f9f9f9]">
              <div className="hidden grid-cols-[0.8fr_1.4fr_0.8fr_0.8fr_0.8fr_1fr] gap-4 border-b border-[#cfcfcf] bg-[#eeeeee] px-4 py-3 text-center font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5a5a5a] md:grid">
                <div>Match</div>
                <div>Players</div>
                <div>Status</div>
                <div>Buy-in</div>
                <div>Outcome</div>
                <div>Portfolio Change</div>
              </div>
              <div className="divide-y divide-[#d3d3d3]">
                {stats.recent.map((match) => {
                  const statusLabel = match.status === 0 ? 'To Start' : match.status === 1 ? 'Ongoing' : 'Finished';
                  const outcomeLabel =
                    match.status !== 2
                      ? '-'
                      : match.winner.toLowerCase() === zeroAddress
                        ? 'Draw'
                        : match.winner.toLowerCase() === address.toLowerCase()
                          ? 'Win'
                          : 'Loss';
                  const connectedAddress = address.toLowerCase();
                  const playersLabel =
                    match.playerA.toLowerCase() === connectedAddress
                      ? `YOU vs ${formatAddress(match.playerB)}`
                      : match.playerB.toLowerCase() === connectedAddress
                        ? `${formatAddress(match.playerA)} vs YOU`
                        : `${formatAddress(match.playerA)} vs ${formatAddress(match.playerB)}`;
                  const portfolioChangeLabel =
                    match.status !== 2
                      ? '-'
                      : match.winner.toLowerCase() === zeroAddress
                        ? '-'
                        : match.winner.toLowerCase() === connectedAddress
                          ? `+${compactNumber(formatUnits(match.buyIn, buyInTokenDecimals))}`
                          : `-${compactNumber(formatUnits(match.buyIn, buyInTokenDecimals))}`;
                  return (
                    <div
                      key={`dashboard-recent-${match.id.toString()}`}
                      className="grid gap-4 bg-[#f9f9f9] px-4 py-4 text-center font-mono text-sm font-bold text-[#3b3b3b] md:grid-cols-[0.8fr_1.4fr_0.8fr_0.8fr_0.8fr_1fr] md:items-center"
                    >
                      <div>#{match.id.toString()}</div>
                      <div>{playersLabel}</div>
                      <div>{statusLabel}</div>
                      <div>{compactNumber(formatUnits(match.buyIn, buyInTokenDecimals))}</div>
                      <div>{outcomeLabel}</div>
                      <div>{portfolioChangeLabel}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      <JoinMatchModal
        isOpen={Boolean(selectedReservedMatchToJoin)}
        match={selectedReservedMatchToJoin}
        buyInTokenAddress={buyInTokenAddressData as Address | undefined}
        buyInTokenSymbol={buyInTokenSymbol}
        buyInTokenDecimals={buyInTokenDecimals}
        hyperDuelContractAddress={hyperDuelContractAddress}
        onJoined={() => {
          setMatchesReloadNonce((value) => value + 1);
        }}
        onClose={() => setSelectedReservedMatchToJoin(null)}
      />
    </section>
  );
}
