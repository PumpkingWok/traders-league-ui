import { useEffect, useMemo, useState } from 'react';
import { formatUnits, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { erc20MetadataAbi, hyperDuelAbi } from '../config/abis';
import { hyperDuelContractByChainId, tokenIndexByChainId, zeroAddress } from '../config/contracts';
import { compactNumber, formatAddress, formatDurationFromSeconds } from '../utils/format';
import { emitBalanceRefresh } from '../utils/appEvents';
import { MatchRow } from '../components/MatchRow';
import { JoinMatchModal } from '../components/JoinMatchModal';
import { ResolveMatchModal } from '../components/ResolveMatchModal';
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
const subgraphMatchesUrl = (__GOLDSKY_SUBGRAPH_URL__ ?? '').trim();

type ContractMatchRecord = {
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

const normalizeSubgraphMatchRow = (raw: Record<string, unknown>): ContractMatchRecord | null => {
  const id = readBigInt(raw.matchId ?? raw.match_id ?? raw.id);
  if (id === null || id <= 0n) return null;

  const playerA = readAddress(raw.playerA ?? raw.player_a);
  const playerB = readAddress(raw.playerB ?? raw.player_b);
  const winner = readAddress(raw.winner);
  const buyIn = readBigInt(raw.buyIn ?? raw.buy_in) ?? 0n;
  const duration = readBigInt(raw.duration) ?? 0n;
  const endTs = readBigInt(raw.endTs ?? raw.end_ts ?? raw.endTime ?? raw.end_time) ?? 0n;
  const status = readNumber(raw.status ?? raw.statusCode ?? raw.status_code) ?? 0;
  const tokensAllowed = normalizeSubgraphTokenIds(raw.tokensAllowed ?? raw.tokens_allowed);

  const isEmptyMatch =
    playerA.toLowerCase() === zeroAddress &&
    playerB.toLowerCase() === zeroAddress &&
    winner.toLowerCase() === zeroAddress &&
    buyIn === 0n &&
    duration === 0n &&
    endTs === 0n &&
    status === 0 &&
    tokensAllowed.length === 0;
  if (isEmptyMatch) return null;

  return {
    id,
    playerA,
    playerB,
    winner,
    currentWinner: winner,
    buyIn,
    duration,
    endTs,
    status,
    tokensAllowed,
  };
};

const fetchMatchesFromSubgraph = async ({
  endpoint,
  limit,
}: {
  endpoint: string;
  limit: number;
}): Promise<ContractMatchRecord[] | null> => {
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
      .filter((row): row is ContractMatchRecord => row !== null);

    normalized.sort((a, b) => Number(b.id - a.id));
    return normalized;
  }

  return null;
};

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
  const [contractMatches, setContractMatches] = useState<ContractMatchRecord[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [selectedMatchToJoin, setSelectedMatchToJoin] = useState<Match | null>(null);
  const [selectedMatchToResolve, setSelectedMatchToResolve] = useState<{
    matchId: bigint;
    playerA: Address;
    playerB: Address;
    predictedWinner: Address;
    buyIn: bigint;
  } | null>(null);

  const [matchFilter, setMatchFilter] = useState<'to-start' | 'current' | 'finish' | 'all'>('to-start');
  const [sortBy, setSortBy] = useState<'duration' | 'buyIn'>('duration');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000));
  const [matchesReloadNonce, setMatchesReloadNonce] = useState(0);
  const [concludingMatchId, setConcludingMatchId] = useState<bigint | null>(null);
  const [unjoiningMatchId, setUnjoiningMatchId] = useState<bigint | null>(null);
  const [isPrizeInfoOpen, setIsPrizeInfoOpen] = useState(false);
  const hideCountdownAndWinner = matchFilter === 'to-start';
  const hideStatus = matchFilter === 'finish' || matchFilter === 'to-start' || matchFilter === 'current';
  const hideAction = matchFilter === 'finish' || matchFilter === 'current' || matchFilter === 'all';
  const visibleColumns =
    6 + (hideCountdownAndWinner ? 0 : 2) + (hideStatus ? 0 : 1) + (hideAction ? 0 : 1);
  const matchTableGridTemplate = `repeat(${visibleColumns}, minmax(0, 1fr))`;
  const { data: concludeMatchHash, error: concludeMatchError, isPending: isConcludePending, writeContract: writeConcludeMatch } = useWriteContract();
  const { isLoading: isConcludeConfirming, isSuccess: isConcludeConfirmed } = useWaitForTransactionReceipt({
    hash: concludeMatchHash,
  });
  const {
    data: unjoinMatchHash,
    error: unjoinMatchError,
    isPending: isUnjoinPending,
    writeContract: writeUnjoinMatch,
  } = useWriteContract();
  const { isLoading: isUnjoinConfirming, isSuccess: isUnjoinConfirmed } = useWaitForTransactionReceipt({
    hash: unjoinMatchHash,
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

  const buyInTokenSymbol = (buyInTokenMetadata?.[0]?.result as string | undefined) ?? 'USDC';
  const buyInTokenDecimals = Number((buyInTokenMetadata?.[1]?.result as number | undefined) ?? 6);
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
    emitBalanceRefresh();
  }, [isConcludeConfirmed]);

  useEffect(() => {
    if (!concludeMatchError) return;
    setConcludingMatchId(null);
    setMatchesError(concludeMatchError.message);
  }, [concludeMatchError]);

  useEffect(() => {
    if (!isUnjoinConfirmed) return;
    setUnjoiningMatchId(null);
    setMatchesReloadNonce((value) => value + 1);
    emitBalanceRefresh();
  }, [isUnjoinConfirmed]);

  useEffect(() => {
    if (!unjoinMatchError) return;
    setUnjoiningMatchId(null);
    setMatchesError(unjoinMatchError.message);
  }, [unjoinMatchError]);

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
        const hydrateCurrentWinners = async (records: ContractMatchRecord[]): Promise<ContractMatchRecord[]> => {
          return Promise.all(
            records.map(async (record) => {
              if (
                record.status !== 1 ||
                record.playerA.toLowerCase() === zeroAddress ||
                record.playerB.toLowerCase() === zeroAddress
              ) {
                return record;
              }

              try {
                const [playerATotalUsd, playerBTotalUsd] = (await Promise.all([
                  publicClient.readContract({
                    address: hyperDuelContractAddress,
                    abi: hyperDuelAbi,
                    functionName: 'getPlayerTotalUsd',
                    args: [record.id, record.playerA],
                  }),
                  publicClient.readContract({
                    address: hyperDuelContractAddress,
                    abi: hyperDuelAbi,
                    functionName: 'getPlayerTotalUsd',
                    args: [record.id, record.playerB],
                  }),
                ])) as [bigint, bigint];

                const currentWinner =
                  playerATotalUsd === playerBTotalUsd
                    ? (zeroAddress as Address)
                    : playerATotalUsd > playerBTotalUsd
                      ? record.playerA
                      : record.playerB;

                return {
                  ...record,
                  currentWinner,
                };
              } catch {
                return record;
              }
            }),
          );
        };

        const fetchMatchesFromContract = async (): Promise<ContractMatchRecord[]> => {
          const matchIds = Array.from({ length: latestMatchId }, (_, index) => BigInt(index + 1));
          const records = (
            await Promise.all(
              matchIds.map(async (id) => {
                try {
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

                  const normalizedTokensAllowed = tokensAllowed.map((tokenId) => Number(tokenId));
                  const isEmptyMatch =
                    match[0].toLowerCase() === zeroAddress &&
                    match[1].toLowerCase() === zeroAddress &&
                    match[2].toLowerCase() === zeroAddress &&
                    match[3] === 0n &&
                    match[4] === 0n &&
                    match[5] === 0n &&
                    Number(match[6]) === 0 &&
                    normalizedTokensAllowed.length === 0;

                  if (isEmptyMatch) return null;

                  return {
                    id,
                    playerA: match[0],
                    playerB: match[1],
                    winner: match[2],
                    currentWinner: match[2],
                    buyIn: match[3],
                    duration: match[4],
                    endTs: match[5],
                    status: Number(match[6]),
                    tokensAllowed: normalizedTokensAllowed,
                  };
                } catch {
                  return null;
                }
              }),
            )
          ).filter((match): match is ContractMatchRecord => match !== null);

          return hydrateCurrentWinners(records);
        };

        let records: ContractMatchRecord[] | null = null;
        if (subgraphMatchesUrl) {
          const subgraphRecords = await fetchMatchesFromSubgraph({
            endpoint: subgraphMatchesUrl,
            limit: latestMatchId,
          });
          if (subgraphRecords) {
            records = await hydrateCurrentWinners(subgraphRecords);
          }
        }

        if (!records) {
          records = await fetchMatchesFromContract();
        }

        if (!cancelled) {
          setContractMatches(records);
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

  useEffect(() => {
    if (matchFilter !== 'to-start') return;
    if (contractMatches.length === 0) return;

    const hasToStartMatches = contractMatches.some(
      (match) => match.status === 0 && match.playerB.toLowerCase() === zeroAddress,
    );
    const hasVisibleMatches = contractMatches.some(
      (match) => !(match.status === 0 && match.playerB.toLowerCase() !== zeroAddress),
    );

    if (!hasToStartMatches && hasVisibleMatches) {
      setMatchFilter('all');
    }
  }, [contractMatches, matchFilter]);

  const displayMatches = useMemo(() => {
    const connectedAddress = address?.toLowerCase();
    const tokenLabelById = Object.entries(tokenIndexMap).reduce<Record<number, string>>((accumulator, [label, id]) => {
      accumulator[id] = label;
      return accumulator;
    }, {});

    const filtered = contractMatches.filter((match) => {
      const isReservedMatch = match.status === 0 && match.playerB.toLowerCase() !== zeroAddress;
      if (isReservedMatch) return false;
      if (matchFilter === 'to-start') return match.status === 0;
      if (matchFilter === 'current') return match.status === 1;
      if (matchFilter === 'finish') return match.status === 2 || match.status === 3;
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
      const isPlayerAConnected = Boolean(connectedAddress) && match.playerA.toLowerCase() === connectedAddress;
      const isPlayerBConnected = Boolean(connectedAddress) && match.playerB.toLowerCase() === connectedAddress;
      const isJoined = Boolean(isPlayerAConnected || isPlayerBConnected);
      const playersCount = Number(match.playerA.toLowerCase() !== zeroAddress) + Number(match.playerB.toLowerCase() !== zeroAddress);
      const hasOpenSeat =
        match.status === 0 &&
        playersCount < 2 &&
        match.playerB.toLowerCase() === zeroAddress;
      const canJoin = hasOpenSeat && !isJoined;
      const canUnjoin = match.status === 0 && isJoined;
      const playersTooltip =
        playersCount === 2
          ? `Players: ${match.playerA} vs ${match.playerB}`
          : match.playerA.toLowerCase() === zeroAddress
            ? undefined
            : isPlayerAConnected
              ? `First player: YOU (${match.playerA})`
              : `First player: ${match.playerA}`;
      const statusLabel = match.status === 0 ? 'To Start' : match.status === 1 ? 'Ongoing' : 'Finished';
      const assetsLabel =
        match.tokensAllowed.length > 0
          ? match.tokensAllowed.map((tokenId) => tokenLabelById[tokenId] ?? `T${tokenId}`).join(' • ')
          : 'No assets';
      const winnerAddress = match.winner.toLowerCase();
      const currentWinnerAddress = match.currentWinner.toLowerCase();
      const winnerLabel =
        match.status >= 2
          ? winnerAddress === zeroAddress
            ? 'Draw'
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
      const isUnjoining =
        unjoiningMatchId === match.id && (isUnjoinPending || isUnjoinConfirming);

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
        playersTooltip,
        statusCode: match.status,
        status: statusLabel,
        winner: winnerLabel,
        playerAAddress: match.playerA,
        playerBAddress: match.playerB,
        winnerAddress: match.winner,
        currentWinnerAddress: match.currentWinner,
        isJoined,
        canJoin,
        canUnjoin,
        canConclude,
        isConcluding,
        isUnjoining,
      };
    });
  }, [address, buyInTokenDecimals, buyInTokenSymbol, concludingMatchId, contractMatches, isConcludeConfirming, isConcludePending, isUnjoinConfirming, isUnjoinPending, matchFilter, nowTs, platformFeeBps, sortBy, sortDirection, tokenIndexMap, unjoiningMatchId]);

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

  const openResolveModal = (match: (typeof displayMatches)[number]) => {
    setSelectedMatchToResolve({
      matchId: match.matchId,
      playerA: match.playerAAddress,
      playerB: match.playerBAddress,
      predictedWinner: match.currentWinnerAddress,
      buyIn: match.buyInRaw,
    });
  };

  const confirmResolveMatch = () => {
    if (!selectedMatchToResolve) return;
    const matchId = selectedMatchToResolve.matchId;
    setSelectedMatchToResolve(null);
    handleConcludeMatch(matchId);
  };

  const handleUnjoinMatch = (matchId: bigint) => {
    if (!hyperDuelContractAddress || isUnjoinPending || isUnjoinConfirming) return;
    setUnjoiningMatchId(matchId);
    writeUnjoinMatch({
      address: hyperDuelContractAddress,
      abi: hyperDuelAbi,
      functionName: 'unjoinMatch',
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

            <div className="overflow-visible border border-[#b8b8b8] bg-[#f9f9f9]">
              <div
                className="hidden w-full gap-4 border-b border-[#cfcfcf] bg-[#eeeeee] px-4 py-3 text-center font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5a5a5a] md:grid"
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
                {!hideStatus ? <div>Status</div> : null}
                {!hideCountdownAndWinner ? (
                  <div className="text-center">{matchFilter === 'current' ? 'Current Winner' : 'Winner'}</div>
                ) : null}
                {!hideAction ? <div>Action</div> : null}
              </div>

              <div className="divide-y divide-[#d3d3d3]">
                {isLoadingMatches && displayMatches.length === 0 ? (
                  <div className="px-4 py-6 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#5a5a5a]">
                    Loading matches from contract...
                  </div>
                ) : !hyperDuelContractAddress ? (
                  <div className="px-4 py-6 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#9a4f4f]">
                    No HyperDuel contract configured for this network.
                  </div>
                ) : displayMatches.length === 0 ? (
                  <div className="px-4 py-6 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#6b6b6b]">
                    No matches for this filter
                  </div>
                ) : (
                  displayMatches.map((match) => (
                    <MatchRow
                      key={match.id}
                      match={match}
                      gridTemplateColumns={matchTableGridTemplate}
                      hideCountdownAndWinner={hideCountdownAndWinner}
                      hideStatus={hideStatus}
                      hideAction={hideAction}
                      onConclude={() => openResolveModal(match)}
                      onJoin={() => setSelectedMatchToJoin(match)}
                      onUnjoin={() => handleUnjoinMatch(match.matchId)}
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
        onJoined={(joinedMatchId) => {
          setContractMatches((current) =>
            current.map((match) => {
              if (match.id !== joinedMatchId) return match;
              const fallbackEndTs = BigInt(Math.floor(Date.now() / 1000)) + match.duration;
              return {
                ...match,
                playerB: (address ?? match.playerB) as Address,
                status: 1,
                endTs: match.endTs > 0n ? match.endTs : fallbackEndTs,
              };
            }),
          );
          setMatchesReloadNonce((value) => value + 1);
        }}
        onClose={() => setSelectedMatchToJoin(null)}
      />

      <ResolveMatchModal
        isOpen={Boolean(selectedMatchToResolve)}
        matchId={selectedMatchToResolve?.matchId ?? 0n}
        playerA={selectedMatchToResolve?.playerA ?? zeroAddress}
        playerB={selectedMatchToResolve?.playerB ?? zeroAddress}
        predictedWinner={selectedMatchToResolve?.predictedWinner ?? zeroAddress}
        buyIn={selectedMatchToResolve?.buyIn ?? 0n}
        buyInTokenSymbol={buyInTokenSymbol}
        buyInTokenDecimals={buyInTokenDecimals}
        platformFeeBps={platformFeeBps}
        isConfirming={Boolean(isConcludePending || isConcludeConfirming)}
        onConfirm={confirmResolveMatch}
        onClose={() => setSelectedMatchToResolve(null)}
      />
    </section>
  );
}
