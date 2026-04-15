import { useEffect, useMemo, useState } from 'react';
import { formatUnits, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts } from 'wagmi';
import { erc20MetadataAbi, hyperDuelAbi } from '../config/abis';
import { hyperDuelContractByChainId, zeroAddress } from '../config/contracts';
import { compactNumber, formatAddress } from '../utils/format';

const platformFeeBase = 10_000n;

type DashboardMatch = {
  id: bigint;
  playerA: Address;
  playerB: Address;
  winner: Address;
  buyIn: bigint;
  status: number;
};

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(1)}%`;
}

export default function DashboardPage() {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const hyperDuelContractAddress = hyperDuelContractByChainId[chainId];

  const [matches, setMatches] = useState<DashboardMatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const ids = Array.from({ length: latestMatchId }, (_, index) => BigInt(index + 1));
        const results = await Promise.allSettled(
          ids.map(async (id) => {
            const match = (await publicClient.readContract({
              address: hyperDuelContractAddress,
              abi: hyperDuelAbi,
              functionName: 'matches',
              args: [id],
            })) as readonly [Address, Address, Address, bigint, bigint, bigint, number];

            const playerA = match[0];
            const playerB = match[1];
            if (playerA.toLowerCase() !== account && playerB.toLowerCase() !== account) {
              return null;
            }

            return {
              id,
              playerA,
              playerB,
              winner: match[2],
              buyIn: match[3],
              status: Number(match[6]),
            } satisfies DashboardMatch;
          }),
        );

        if (!cancelled) {
          const hydrated = results
            .filter((item): item is PromiseFulfilledResult<DashboardMatch | null> => item.status === 'fulfilled')
            .map((item) => item.value)
            .filter((item): item is DashboardMatch => item !== null);
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
  }, [address, hyperDuelContractAddress, isConnected, latestMatchIdData, publicClient]);

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

    const netPrizeForMatch = (buyIn: bigint) => {
      const grossPrize = buyIn * 2n;
      const feeAmount = (grossPrize * platformFeeBps) / platformFeeBase;
      return grossPrize - feeAmount;
    };

    const prizeWon = concluded.reduce((accumulator, match) => {
      if (match.winner.toLowerCase() !== address?.toLowerCase()) return accumulator;
      return accumulator + netPrizeForMatch(match.buyIn);
    }, 0n);

    const totalBuyIns = concluded.reduce((accumulator, match) => accumulator + match.buyIn, 0n);
    const pnl = prizeWon - totalBuyIns;

    return {
      joined: joined.length,
      ongoing: ongoing.length,
      concluded: concluded.length,
      wins,
      losses,
      draws,
      winRate,
      lossRate,
      prizeWon,
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
          {error ? (
            <div className="border border-[#d4a2a2] bg-[#f8e6e6] px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#8a4747]">
              {error}
            </div>
          ) : null}
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
              <div className="hidden grid-cols-[0.8fr_1.4fr_0.8fr_0.8fr_1fr] gap-4 border-b border-[#cfcfcf] bg-[#eeeeee] px-4 py-3 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5a5a5a] md:grid">
                <div>Match</div>
                <div>Players</div>
                <div>Status</div>
                <div>Buy-in</div>
                <div>Outcome</div>
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
                  return (
                    <div
                      key={`dashboard-recent-${match.id.toString()}`}
                      className="grid gap-4 bg-[#f9f9f9] px-4 py-4 font-mono text-sm font-bold text-[#3b3b3b] md:grid-cols-[0.8fr_1.4fr_0.8fr_0.8fr_1fr] md:items-center"
                    >
                      <div>#{match.id.toString()}</div>
                      <div>{`${formatAddress(match.playerA)} vs ${formatAddress(match.playerB)}`}</div>
                      <div>{statusLabel}</div>
                      <div>{compactNumber(formatUnits(match.buyIn, buyInTokenDecimals))}</div>
                      <div>{outcomeLabel}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
