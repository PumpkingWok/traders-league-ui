import { useEffect, useMemo, useState } from 'react';
import { formatUnits, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { erc20MetadataAbi, hyperDuelAbi } from '../config/abis';
import { hyperDuelContractByChainId, tokenIndexByChainId, zeroAddress } from '../config/contracts';
import { compactNumber, formatAddress, formatDurationFromSeconds } from '../utils/format';
import { MatchRow } from '../components/MatchRow';
import { JoinMatchModal } from '../components/JoinMatchModal';
import { type Match } from '../types/match';

function formatMatchCountdown(remainingSeconds: bigint): string {
  if (remainingSeconds <= 0n) return 'Ended';

  if (remainingSeconds < 600n) {
    const minutes = remainingSeconds / 60n;
    const seconds = remainingSeconds % 60n;
    return `${minutes.toString()}m ${seconds.toString().padStart(2, '0')}s`;
  }

  const totalMinutes = remainingSeconds / 60n;
  const hours = totalMinutes / 60n;
  const minutes = totalMinutes % 60n;

  if (hours > 0n) return `${hours.toString()}h ${minutes.toString().padStart(2, '0')}m`;
  return `${minutes.toString()}m`;
}

const platformFeeBase = 10_000n;

export default function MatchesPage({
  onOpenCreateMatch,
  refreshNonce,
}: {
  onOpenCreateMatch: () => void;
  refreshNonce: number;
}) {
  const { address } = useAccount();
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
      endTs: bigint;
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
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000));
  const [matchesReloadNonce, setMatchesReloadNonce] = useState(0);
  const [concludingMatchId, setConcludingMatchId] = useState<bigint | null>(null);
  const [isPrizeInfoOpen, setIsPrizeInfoOpen] = useState(false);
  const hideCountdownAndWinner = matchFilter === 'to-start';
  const matchTableGridTemplate = hideCountdownAndWinner
    ? 'repeat(8, minmax(0, 1fr))'
    : 'repeat(10, minmax(0, 1fr))';
  const { data: concludeMatchHash, error: concludeMatchError, isPending: isConcludePending, writeContract: writeConcludeMatch } = useWriteContract();
  const { isLoading: isConcludeConfirming, isSuccess: isConcludeConfirmed } = useWaitForTransactionReceipt({
    hash: concludeMatchHash,
  });

  const { data: latestMatchIdData, refetch: refetchLatestMatchId } = useReadContract({
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
  const platformFeePercentLabel = useMemo(() => {
    const value = Number(platformFeeBps) / 100;
    if (!Number.isFinite(value)) return `${platformFeeBps.toString()} bps`;
    return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
  }, [platformFeeBps]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTs(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!hyperDuelContractAddress) return;
    void refetchLatestMatchId();
  }, [hyperDuelContractAddress, refreshNonce, refetchLatestMatchId]);

  useEffect(() => {
    if (!isConcludeConfirmed) return;
    setConcludingMatchId(null);
    setMatchesReloadNonce((value) => value + 1);
  }, [isConcludeConfirmed]);

  useEffect(() => {
    if (!concludeMatchError) return;
    setConcludingMatchId(null);
    setMatchesError(concludeMatchError.message);
  }, [concludeMatchError]);

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
              endTs: match[5],
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
  }, [hyperDuelContractAddress, latestMatchIdData, matchesReloadNonce, publicClient]);

  const displayMatches = useMemo(() => {
    const connectedAddress = address?.toLowerCase();
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
      const isJoined =
        Boolean(connectedAddress) &&
        (match.playerA.toLowerCase() === connectedAddress || match.playerB.toLowerCase() === connectedAddress);
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
      const remainingSeconds = match.endTs - BigInt(nowTs);
      const countdownLabel =
        match.status === 0
          ? 'Not started'
          : remainingSeconds > 0n
            ? formatMatchCountdown(remainingSeconds)
            : 'Ended';
      const grossPrize = match.buyIn * 2n;
      const feeAmount = (grossPrize * platformFeeBps) / platformFeeBase;
      const netPrize = grossPrize - feeAmount;
      const canConclude = match.status === 1 && remainingSeconds <= 0n;
      const isConcluding =
        concludingMatchId === match.id && (isConcludePending || isConcludeConfirming);

      return {
        id: `#${match.id.toString()}`,
        matchId: match.id,
        buyInRaw: match.buyIn,
        assets: assetsLabel,
        buyIn: `${compactNumber(formatUnits(match.buyIn, buyInTokenDecimals))} ${buyInTokenSymbol}`,
        prize: `${compactNumber(formatUnits(netPrize, buyInTokenDecimals))} ${buyInTokenSymbol}`,
        duration: formatDurationFromSeconds(match.duration),
        countdown: countdownLabel,
        players: `${playersCount}/2`,
        statusCode: match.status,
        status: statusLabel,
        winner: winnerLabel,
        isJoined,
        canConclude,
        isConcluding,
      };
    });
  }, [address, buyInTokenDecimals, buyInTokenSymbol, concludingMatchId, contractMatches, isConcludeConfirming, isConcludePending, matchFilter, nowTs, platformFeeBps, sortBy, sortDirection, tokenIndexMap]);

  const handleConcludeMatch = (matchId: bigint) => {
    if (!hyperDuelContractAddress || isConcludePending || isConcludeConfirming) return;
    setConcludingMatchId(matchId);
    writeConcludeMatch({
      address: hyperDuelContractAddress,
      abi: hyperDuelAbi,
      functionName: 'concludeMatch',
      args: [matchId],
    });
  };

  const sortButtonClass = (active: boolean) =>
    `border px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] ${
      active
        ? 'border-[#8f83ff] bg-[#ece9ff] text-[#433d98]'
        : 'border-[#b9b9b9] bg-[#f8f8f8] text-[#4d4d4d] hover:bg-[#eeeeee]'
    }`;

  const filterTabClass = (active: boolean) =>
    `border px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] ${
      active
        ? 'border-[#8f83ff] bg-[#ece9ff] text-[#433d98]'
        : 'border-[#b9b9b9] bg-[#f8f8f8] text-[#555] hover:bg-[#efefef]'
    }`;

  return (
    <section className="space-y-6 text-[#2f2f2f]">
      <section className="border border-[#a8a8a8] bg-[#f1f1f1]">
        <div className="h-1 w-full bg-[linear-gradient(90deg,#8f83ff_0%,#7ed8ff_50%,#8f83ff_100%)]" />
        <div className="px-4 py-6 md:px-8 md:py-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex border border-[#9d9d9d] bg-[#e7e7e7] px-3 py-1 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#525252]">
              Match Lobby
            </div>
            <h1 className="font-mono text-3xl font-black uppercase tracking-[0.06em] text-[#2b2b2b] md:text-5xl">
              Create Or Join A 1v1 Match
            </h1>
            <p className="font-mono text-sm font-bold leading-6 text-[#4d4d4d] md:text-base">
              Configure the allowed assets, lock the buy-in, and jump into the live lobby to find
              your next trading battle.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onOpenCreateMatch}
              className="border border-[#8f83ff] bg-[#ece9ff] px-4 py-2 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#453e9d] hover:bg-[#e3deff]"
            >
              Create Match
            </button>
          </div>
        </div>
        </div>
      </section>

      <section>
        <section className="border border-[#a8a8a8] bg-[#f4f4f4]">
          <div className="border-b border-[#bcbcbc] bg-[#ebebeb] px-4 py-3 md:px-6">
            <div className="font-mono text-lg font-black uppercase tracking-[0.08em] text-[#363636]">
              Open 1v1 Matches
            </div>
          </div>
          <div className="space-y-4 px-4 py-4 md:px-6 md:py-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                <button type="button" className={sortButtonClass(sortBy === 'duration')} onClick={() => setSortBy('duration')}>
                  Sort: Duration
                </button>
                <button type="button" className={sortButtonClass(sortBy === 'buyIn')} onClick={() => setSortBy('buyIn')}>
                  Sort: Buy-In
                </button>
                <button type="button" className={sortButtonClass(sortDirection === 'asc')} onClick={() => setSortDirection('asc')}>
                  Asc
                </button>
                <button type="button" className={sortButtonClass(sortDirection === 'desc')} onClick={() => setSortDirection('desc')}>
                  Desc
                </button>
              </div>

              <div className="flex items-center gap-2 self-start lg:self-auto">
                <button type="button" className={filterTabClass(matchFilter === 'to-start')} onClick={() => setMatchFilter('to-start')}>
                  TOSTART
                </button>
                <button type="button" className={filterTabClass(matchFilter === 'current')} onClick={() => setMatchFilter('current')}>
                  CURRENT
                </button>
                <button type="button" className={filterTabClass(matchFilter === 'finish')} onClick={() => setMatchFilter('finish')}>
                  FINISH
                </button>
                <button type="button" className={filterTabClass(matchFilter === 'all')} onClick={() => setMatchFilter('all')}>
                  ALL
                </button>
              </div>
            </div>

            <div className="overflow-hidden border border-[#b8b8b8] bg-[#f9f9f9]">
              {matchesError && displayMatches.length > 0 ? (
                <div className="border-b border-[#d4a2a2] bg-[#f8e6e6] px-4 py-3 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#8a4747]">
                  {matchesError}
                </div>
              ) : null}
              <div
                className="hidden w-full gap-4 border-b border-[#cfcfcf] bg-[#eeeeee] px-4 py-3 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5a5a5a] md:grid"
                style={{ gridTemplateColumns: matchTableGridTemplate }}
              >
                <div>Match ID</div>
                <div className="whitespace-nowrap">Assets</div>
                <div className="whitespace-nowrap">Buy-In</div>
                <div
                  className="relative whitespace-nowrap"
                  onMouseEnter={() => setIsPrizeInfoOpen(true)}
                  onMouseLeave={() => setIsPrizeInfoOpen(false)}
                >
                  <span className="inline-flex cursor-help items-center gap-1">
                    <span>Prize</span>
                    <span className="inline-flex h-4 w-4 items-center justify-center border border-[#b9b9b9] text-[10px] leading-none text-[#666]">?</span>
                  </span>
                  {isPrizeInfoOpen ? (
                    <div className="absolute left-0 top-full z-20 mt-2 w-72 border border-[#b9b9b9] bg-[#f9f9f9] p-3 font-mono text-[11px] font-bold normal-case tracking-normal text-[#4d4d4d] shadow-[0_8px_20px_rgba(0,0,0,0.12)]">
                      Prize formula: <span className="text-[#2f2f2f]">2 * buyIn - platform fees</span>
                      <div className="mt-2">
                        Platform fee: <span className="text-[#2f2f2f]">{platformFeePercentLabel}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div>Duration</div>
                {!hideCountdownAndWinner ? <div>Countdown</div> : null}
                <div>Players</div>
                <div>Status</div>
                {!hideCountdownAndWinner ? <div>Winner</div> : null}
                <div>Action</div>
              </div>

              <div className="divide-y divide-[#d3d3d3]">
                {isLoadingMatches ? (
                  <div className="px-4 py-6 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#5a5a5a]">
                    Loading matches from contract...
                  </div>
                ) : !hyperDuelContractAddress ? (
                  <div className="px-4 py-6 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#9a4f4f]">
                    No HyperDuel contract configured for this network.
                  </div>
                ) : displayMatches.length === 0 ? (
                  matchesError ? (
                    <div className="px-4 py-6 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#9a4f4f]">
                      Failed to load matches
                    </div>
                  ) : (
                    <div className="px-4 py-6 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#6b6b6b]">
                      No matches for this filter
                    </div>
                  )
                ) : (
                  displayMatches.map((match) => (
                    <MatchRow
                      key={match.id}
                      match={match}
                      gridTemplateColumns={matchTableGridTemplate}
                      hideCountdownAndWinner={hideCountdownAndWinner}
                      onConclude={() => handleConcludeMatch(match.matchId)}
                      onJoin={() => setSelectedMatchToJoin(match)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </section>

      <JoinMatchModal
        isOpen={Boolean(selectedMatchToJoin)}
        match={selectedMatchToJoin}
        buyInTokenAddress={buyInTokenAddressData as Address | undefined}
        buyInTokenSymbol={buyInTokenSymbol}
        buyInTokenDecimals={buyInTokenDecimals}
        hyperDuelContractAddress={hyperDuelContractAddress}
        onJoined={() => setMatchesReloadNonce((value) => value + 1)}
        onClose={() => setSelectedMatchToJoin(null)}
      />
    </section>
  );
}
