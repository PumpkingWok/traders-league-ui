import { useEffect, useMemo, useState } from 'react';
import { formatUnits, type Address } from 'viem';
import { useChainId, usePublicClient, useReadContract, useReadContracts } from 'wagmi';
import { erc20MetadataAbi, hyperDuelAbi } from '../config/abis';
import { hyperDuelContractByChainId, tokenIndexByChainId, zeroAddress } from '../config/contracts';
import { compactNumber, formatAddress, formatDurationFromSeconds } from '../utils/format';
import { PixelButton, PixelPanel, PixelSelectButton, PixelTab } from '../components/pixel';
import { MatchRow } from '../components/MatchRow';
import { JoinMatchModal } from '../components/JoinMatchModal';
import { type Match } from '../types/match';

export default function MatchesPage({
  onOpenCreateMatch,
}: {
  onOpenCreateMatch: () => void;
}) {
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const hyperDuelContractAddress = hyperDuelContractByChainId[chainId];
  const tokenIndexMap = tokenIndexByChainId[chainId] ?? {};
  const [contractMatches, setContractMatches] = useState<
    Array<{
      id: bigint;
      playerA: Address;
      playerB: Address;
      winner: Address;
      currentWinner: Address;
      buyIn: bigint;
      duration: bigint;
      status: number;
      tokensAllowed: number[];
    }>
  >([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [selectedMatchToJoin, setSelectedMatchToJoin] = useState<Match | null>(null);
  const [matchFilter, setMatchFilter] = useState<'to-start' | 'current' | 'finish' | 'all'>('current');
  const [sortBy, setSortBy] = useState<'duration' | 'buyIn'>('duration');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const { data: latestMatchIdData } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'matchId',
    query: {
      enabled: Boolean(hyperDuelContractAddress),
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

  const buyInTokenSymbol = (buyInTokenMetadata?.[0]?.result as string | undefined) ?? 'TOKEN';
  const buyInTokenDecimals = Number((buyInTokenMetadata?.[1]?.result as number | undefined) ?? 18);

  useEffect(() => {
    if (!publicClient || !hyperDuelContractAddress || latestMatchIdData === undefined) {
      return;
    }

    const latestMatchId = Number(latestMatchIdData);
    if (!Number.isFinite(latestMatchId) || latestMatchId < 1) {
      setContractMatches([]);
      return;
    }

    let cancelled = false;
    const fetchMatches = async () => {
      setIsLoadingMatches(true);
      setMatchesError(null);

      try {
        const matchIds = Array.from({ length: latestMatchId }, (_, index) => BigInt(index + 1));
        const recordsResult = await Promise.allSettled(
          matchIds.map(async (id) => {
            const match = (await publicClient.readContract({
              address: hyperDuelContractAddress,
              abi: hyperDuelAbi,
              functionName: 'matches',
              args: [id],
            })) as readonly [Address, Address, Address, bigint, bigint, bigint, number];

            const tokensAllowed = (await publicClient.readContract({
              address: hyperDuelContractAddress,
              abi: hyperDuelAbi,
              functionName: 'getMatchTokensAllowed',
              args: [id],
            })) as readonly number[] | readonly bigint[];

            let currentWinner = match[2];
            if (
              Number(match[6]) === 1 &&
              match[0].toLowerCase() !== zeroAddress &&
              match[1].toLowerCase() !== zeroAddress
            ) {
              const [playerATotalUsd, playerBTotalUsd] = (await Promise.all([
                publicClient.readContract({
                  address: hyperDuelContractAddress,
                  abi: hyperDuelAbi,
                  functionName: 'getPlayerTotalUsd',
                  args: [id, match[0]],
                }),
                publicClient.readContract({
                  address: hyperDuelContractAddress,
                  abi: hyperDuelAbi,
                  functionName: 'getPlayerTotalUsd',
                  args: [id, match[1]],
                }),
              ])) as [bigint, bigint];

              currentWinner =
                playerATotalUsd === playerBTotalUsd
                  ? (zeroAddress as Address)
                  : playerATotalUsd > playerBTotalUsd
                    ? match[0]
                    : match[1];
            }

            return {
              id,
              playerA: match[0],
              playerB: match[1],
              winner: match[2],
              currentWinner,
              buyIn: match[3],
              duration: match[4],
              status: Number(match[6]),
              tokensAllowed: tokensAllowed.map((tokenId) => Number(tokenId)),
            };
          }),
        );

        if (!cancelled) {
          const records = recordsResult
            .filter((result): result is PromiseFulfilledResult<(typeof contractMatches)[number]> => result.status === 'fulfilled')
            .map((result) => result.value);
          setContractMatches(records);

          const failedReads = recordsResult.length - records.length;
          if (failedReads > 0) {
            setMatchesError(`Some matches could not be loaded (${failedReads} failed read${failedReads === 1 ? '' : 's'}).`);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setContractMatches([]);
          setMatchesError(error instanceof Error ? error.message : 'Could not fetch matches.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMatches(false);
        }
      }
    };

    void fetchMatches();
    return () => {
      cancelled = true;
    };
  }, [hyperDuelContractAddress, latestMatchIdData, publicClient]);

  const displayMatches = useMemo(() => {
    const tokenLabelById = Object.entries(tokenIndexMap).reduce<Record<number, string>>((accumulator, [label, id]) => {
      accumulator[id] = label;
      return accumulator;
    }, {});

    const filtered = contractMatches.filter((match) => {
      if (match.status === 3) return false;
      if (matchFilter === 'to-start') return match.status === 0;
      if (matchFilter === 'current') return match.status === 1;
      if (matchFilter === 'finish') return match.status === 2;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const comparePrimary =
        sortBy === 'duration'
          ? a.duration === b.duration
            ? 0
            : a.duration > b.duration
              ? 1
              : -1
          : a.buyIn === b.buyIn
            ? 0
            : a.buyIn > b.buyIn
              ? 1
              : -1;

      const orderedCompare = sortDirection === 'asc' ? comparePrimary : -comparePrimary;
      if (orderedCompare !== 0) return orderedCompare;
      return Number(b.id - a.id);
    });

    return sorted.map((match) => {
      const playersCount = Number(match.playerA.toLowerCase() !== zeroAddress) + Number(match.playerB.toLowerCase() !== zeroAddress);
      const statusLabel = match.status === 0 ? 'To Start' : match.status === 1 ? 'Ongoing' : 'Finished';
      const assetsLabel =
        match.tokensAllowed.length > 0
          ? match.tokensAllowed.map((tokenId) => tokenLabelById[tokenId] ?? `T${tokenId}`).join(' • ')
          : 'No assets';
      const winnerAddress = match.winner.toLowerCase();
      const currentWinnerAddress = match.currentWinner.toLowerCase();
      const winnerLabel =
        match.status === 2
          ? winnerAddress === zeroAddress
            ? 'Tie'
            : formatAddress(match.winner)
          : match.status === 1
            ? currentWinnerAddress === zeroAddress
              ? 'Undecided'
              : formatAddress(match.currentWinner)
            : '-';

      return {
        id: `#${match.id.toString()}`,
        matchId: match.id,
        buyInRaw: match.buyIn,
        assets: assetsLabel,
        buyIn: `${compactNumber(formatUnits(match.buyIn, buyInTokenDecimals))} ${buyInTokenSymbol}`,
        duration: formatDurationFromSeconds(match.duration),
        players: `${playersCount}/2`,
        statusCode: match.status,
        status: statusLabel,
        winner: winnerLabel,
      };
    });
  }, [buyInTokenDecimals, buyInTokenSymbol, contractMatches, matchFilter, sortBy, sortDirection, tokenIndexMap]);

  return (
    <section className="space-y-6">
      <section className="border-y-4 border-[#0f1645] bg-[#3f8cff]/20 px-4 py-8 shadow-[0_6px_0_0_#0f1645] md:px-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="font-mono text-sm font-black uppercase tracking-[0.2em] text-[#ffbf3f]">
              Match Lobby
            </div>
            <h1 className="font-mono text-3xl font-black uppercase tracking-tight text-white md:text-5xl">
              Create Or Join A 1v1 Match
            </h1>
            <p className="font-mono text-sm font-bold leading-6 text-slate-100 md:text-base">
              Configure the allowed assets, lock the buy-in, and jump into the live lobby to find
              your next trading battle.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <PixelButton variant="gold" onClick={onOpenCreateMatch}>
              Create Match
            </PixelButton>
          </div>
        </div>
      </section>

      <section>
        <PixelPanel title="Open 1v1 Matches">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                <PixelSelectButton active={sortBy === 'duration'} onClick={() => setSortBy('duration')}>
                  Sort: Duration
                </PixelSelectButton>
                <PixelSelectButton active={sortBy === 'buyIn'} onClick={() => setSortBy('buyIn')}>
                  Sort: Buy-In
                </PixelSelectButton>
                <PixelSelectButton active={sortDirection === 'asc'} onClick={() => setSortDirection('asc')}>
                  Asc
                </PixelSelectButton>
                <PixelSelectButton active={sortDirection === 'desc'} onClick={() => setSortDirection('desc')}>
                  Desc
                </PixelSelectButton>
              </div>

              <div className="flex items-center gap-2 self-start lg:self-auto">
                <PixelTab active={matchFilter === 'to-start'} onClick={() => setMatchFilter('to-start')}>
                  TOSTART
                </PixelTab>
                <PixelTab active={matchFilter === 'current'} onClick={() => setMatchFilter('current')}>
                  CURRENT
                </PixelTab>
                <PixelTab active={matchFilter === 'finish'} onClick={() => setMatchFilter('finish')}>
                  FINISH
                </PixelTab>
                <PixelTab active={matchFilter === 'all'} onClick={() => setMatchFilter('all')}>
                  ALL
                </PixelTab>
              </div>
            </div>

            <div className="overflow-hidden border-4 border-[#1b2346] bg-[#14204a] shadow-[0_5px_0_0_#0b1029]">
              {matchesError && displayMatches.length > 0 ? (
                <div className="border-b-4 border-[#4a261a] bg-[#6f3b1e] px-4 py-3 font-mono text-xs font-black uppercase text-[#fff2cf]">
                  {matchesError}
                </div>
              ) : null}
              <div className="hidden grid-cols-[120px_1.2fr_140px_140px_100px_120px_160px_110px] gap-4 border-b-4 border-[#26315f] bg-[#1d2b5f] px-4 py-3 font-mono text-xs font-black uppercase text-slate-200 md:grid">
                <div>Match ID</div>
                <div>Assets</div>
                <div>Buy-In</div>
                <div>Duration</div>
                <div>Players</div>
                <div>Status</div>
                <div>Winner</div>
                <div>Action</div>
              </div>

              <div className="divide-y-4 divide-[#26315f]">
                {isLoadingMatches ? (
                  <div className="px-4 py-6 font-mono text-sm font-black uppercase text-slate-200">
                    Loading matches from contract...
                  </div>
                ) : !hyperDuelContractAddress ? (
                  <div className="px-4 py-6 font-mono text-sm font-black uppercase text-[#ff8f7f]">
                    No HyperDuel contract configured for this network.
                  </div>
                ) : displayMatches.length === 0 ? (
                  matchesError ? (
                    <div className="px-4 py-6 font-mono text-sm font-black uppercase text-[#ff8f7f]">
                      Failed to load matches
                    </div>
                  ) : (
                    <div className="px-4 py-6 font-mono text-sm font-black uppercase text-slate-300">
                      No matches for this filter
                    </div>
                  )
                ) : (
                  displayMatches.map((match) => (
                    <MatchRow key={match.id} match={match} onJoin={() => setSelectedMatchToJoin(match)} />
                  ))
                )}
              </div>
            </div>
          </div>
        </PixelPanel>
      </section>

      <JoinMatchModal
        isOpen={Boolean(selectedMatchToJoin)}
        match={selectedMatchToJoin}
        buyInTokenAddress={buyInTokenAddressData as Address | undefined}
        buyInTokenSymbol={buyInTokenSymbol}
        buyInTokenDecimals={buyInTokenDecimals}
        hyperDuelContractAddress={hyperDuelContractAddress}
        onClose={() => setSelectedMatchToJoin(null)}
      />
    </section>
  );
}
