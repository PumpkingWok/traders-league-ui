import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatUnits, parseUnits, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { hyperDuelAbi } from '../config/abis';
import {
  tokenAvatarUrlByLabel,
  tokenSymbolByLabel,
  zeroAddress,
} from '../config/contracts';
import { compactNumber, formatAddress } from '../utils/format';

const virtualAssetDecimals = 18;
const platformFeeBase = 10_000n;
const tokenPriceDecimals = 4;
const usdVirtualPriceScale = 10_000n;
const subgraphSwapHistoryUrl = (import.meta.env.VITE_GOLDSKY_SUBGRAPH_URL ?? '').trim();
const maxSubgraphSwapRows = 300;

type SwapDraftLeg = {
  id: number;
  tokenIn: number;
  tokenOut: number;
  amountIn: string;
  usePreviousOutput: boolean;
};

type SwapHistoryRow = {
  transactionHash: `0x${string}` | null;
  blockNumber: bigint;
  logIndex: number;
  tokenIn: number;
  tokenOut: number;
  amountIn: bigint;
  amountOut: bigint;
  player: Address;
};

const readBigInt = (value: unknown): bigint | null => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.length > 0) {
    try {
      return value.startsWith('0x') ? BigInt(value) : BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
};

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const casted = Number(value);
    return Number.isFinite(casted) ? casted : null;
  }
  if (typeof value === 'string' && value.length > 0) {
    if (value.startsWith('0x')) {
      const parsedHex = Number.parseInt(value, 16);
      return Number.isFinite(parsedHex) ? parsedHex : null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readAddress = (value: unknown): Address => {
  if (typeof value === 'string' && value.startsWith('0x') && value.length === 42) {
    return value as Address;
  }
  return zeroAddress;
};

const normalizeSubgraphSwapRow = (raw: Record<string, unknown>): SwapHistoryRow | null => {
  const parsedMatchId = readBigInt(raw.matchId ?? raw.match_id);
  if (parsedMatchId === null) return null;

  const tokenIn = readNumber(raw.tokenIn ?? raw.token_in);
  const tokenOut = readNumber(raw.tokenOut ?? raw.token_out);
  const amountIn = readBigInt(raw.amountIn ?? raw.amount_in);
  const amountOut = readBigInt(raw.amountOut ?? raw.amount_out);
  if (tokenIn === null || tokenOut === null || amountIn === null || amountOut === null) return null;

  return {
    transactionHash: (raw.transactionHash ?? raw.transactionHash_ ?? raw.transaction_hash ?? raw.txHash ?? null) as `0x${string}` | null,
    blockNumber: readBigInt(raw.blockNumber ?? raw.block_number) ?? 0n,
    logIndex: readNumber(raw.logIndex ?? raw.log_index) ?? 0,
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    player: readAddress(raw.player),
  };
};

const fetchSwapHistoryFromSubgraph = async ({
  endpoint,
  matchId,
  limit,
}: {
  endpoint: string;
  matchId: bigint;
  limit: number;
}): Promise<SwapHistoryRow[] | null> => {
  const queryAttempts: Array<{ rootFieldName: string; query: string }> = [
    {
      rootFieldName: 'swaps',
      query: `query SwapRows { swaps(first: ${limit}, orderBy: block_number, orderDirection: desc) { matchId tokenIn tokenOut amountIn amountOut player block_number transactionHash_ } }`,
    },
    {
      rootFieldName: 'swaps',
      query: `query SwapRows { swaps(first: ${limit}, orderBy: blockNumber, orderDirection: desc) { matchId tokenIn tokenOut amountIn amountOut player blockNumber transactionHash logIndex } }`,
    },
    {
      rootFieldName: 'swapEvents',
      query: `query SwapRows { swapEvents(first: ${limit}, orderBy: blockNumber, orderDirection: desc) { matchId tokenIn tokenOut amountIn amountOut player blockNumber transactionHash logIndex } }`,
    },
    {
      rootFieldName: 'swaps',
      query: `query SwapRows { swaps(first: ${limit}) { matchId tokenIn tokenOut amountIn amountOut player blockNumber transactionHash logIndex } }`,
    },
    {
      rootFieldName: 'swapEvents',
      query: `query SwapRows { swapEvents(first: ${limit}) { matchId tokenIn tokenOut amountIn amountOut player blockNumber transactionHash logIndex } }`,
    },
    {
      rootFieldName: 'swaps',
      query: `query SwapRows { swaps(first: ${limit}) { match_id token_in token_out amount_in amount_out player block_number transaction_hash log_index } }`,
    },
    {
      rootFieldName: 'swap_events',
      query: `query SwapRows { swap_events(first: ${limit}) { match_id token_in token_out amount_in amount_out player block_number transaction_hash log_index } }`,
    },
  ];

  for (const attempt of queryAttempts) {
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

    const normalizedRows = rows
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const raw = row as Record<string, unknown>;
        const rawMatchId = readBigInt(raw.matchId ?? raw.match_id);
        if (rawMatchId !== null && rawMatchId !== matchId) return null;
        return normalizeSubgraphSwapRow(raw);
      })
      .filter((row): row is SwapHistoryRow => row !== null);

    normalizedRows.sort((a, b) => {
      if (a.blockNumber === b.blockNumber) return b.logIndex - a.logIndex;
      return a.blockNumber > b.blockNumber ? -1 : 1;
    });
    return normalizedRows;
  }

  return null;
};

export function SwapPanel({
  matchId,
  playerA,
  playerB,
  buyIn,
  buyInTokenSymbol,
  buyInTokenDecimals,
  tokensAllowed,
  tokenLabelById,
  hyperDuelContractAddress,
  showMatchDetails = true,
  disableSwap = false,
  duration,
  endTs,
}: {
  matchId: bigint;
  playerA: Address;
  playerB: Address;
  buyIn: bigint;
  buyInTokenSymbol: string;
  buyInTokenDecimals: number;
  tokensAllowed: number[];
  tokenLabelById: Record<number, string>;
  hyperDuelContractAddress?: Address;
  showMatchDetails?: boolean;
  disableSwap?: boolean;
  duration: bigint;
  endTs: bigint;
}) {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const selectableTokens = useMemo(() => [0, ...tokensAllowed], [tokensAllowed]);
  const [swapLegs, setSwapLegs] = useState<SwapDraftLeg[]>([
    {
      id: 1,
      tokenIn: selectableTokens[0] ?? 0,
      tokenOut: selectableTokens[1] ?? selectableTokens[0] ?? 0,
      amountIn: '',
      usePreviousOutput: false,
    },
  ]);
  const [playerATotalUsd, setPlayerATotalUsd] = useState<bigint | null>(null);
  const [playerBTotalUsd, setPlayerBTotalUsd] = useState<bigint | null>(null);
  const [isLoadingMatchDetails, setIsLoadingMatchDetails] = useState(false);
  const [matchDetailsError, setMatchDetailsError] = useState<string | null>(null);
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [failedAvatarByKey, setFailedAvatarByKey] = useState<Record<string, boolean>>({});
  const [expandedStepById, setExpandedStepById] = useState<Record<number, boolean>>({});
  const [swapHistoryRows, setSwapHistoryRows] = useState<SwapHistoryRow[]>([]);
  const [isLoadingSwapHistory, setIsLoadingSwapHistory] = useState(false);
  const [swapHistoryError, setSwapHistoryError] = useState<string | null>(null);

  const {
    data: swapHash,
    error: swapError,
    isPending: isSwapPending,
    writeContract: writeSwap,
  } = useWriteContract();
  const { isLoading: isConfirmingSwap, isSuccess: isSwapConfirmed } = useWaitForTransactionReceipt({
    hash: swapHash,
  });
  const { data: platformFeeData } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'platformFee',
    query: {
      enabled: Boolean(hyperDuelContractAddress),
    },
  });

  const { data: tokenPricesData } = useReadContracts({
    contracts:
      hyperDuelContractAddress && tokensAllowed.length > 0
        ? tokensAllowed.map((tokenId) => ({
            address: hyperDuelContractAddress,
            chainId,
            abi: hyperDuelAbi,
            functionName: 'tokenPx',
            args: [tokenId],
          }))
        : [],
    query: {
      enabled: Boolean(hyperDuelContractAddress && tokensAllowed.length > 0),
    },
  });
  const { data: virtualBalancesData } = useReadContracts({
    contracts:
      hyperDuelContractAddress && address && selectableTokens.length > 0
        ? selectableTokens.map((tokenId) => ({
            address: hyperDuelContractAddress,
            chainId,
            abi: hyperDuelAbi,
            functionName: 'matchBalances',
            args: [address as Address, matchId, BigInt(tokenId)],
          }))
        : [],
    query: {
      enabled: Boolean(hyperDuelContractAddress && address && selectableTokens.length > 0),
    },
  });

  const tokenPriceById = useMemo(() => {
    const map: Record<number, bigint> = { 0: usdVirtualPriceScale };
    tokensAllowed.forEach((tokenId, index) => {
      const result = tokenPricesData?.[index]?.result;
      if (typeof result === 'bigint') {
        map[tokenId] = result;
      } else if (typeof result === 'number' && Number.isFinite(result)) {
        map[tokenId] = BigInt(result);
      }
    });
    return map;
  }, [tokenPricesData, tokensAllowed]);
  const virtualBalanceByTokenId = useMemo(() => {
    return selectableTokens.reduce<Record<number, bigint>>((accumulator, tokenId, index) => {
      const result = virtualBalancesData?.[index]?.result;
      if (typeof result === 'bigint') {
        accumulator[tokenId] = result;
      } else if (typeof result === 'number' && Number.isFinite(result)) {
        accumulator[tokenId] = BigInt(result);
      } else {
        accumulator[tokenId] = 0n;
      }
      return accumulator;
    }, {});
  }, [selectableTokens, virtualBalancesData]);

  const loadMatchDetails = useCallback(async () => {
    if (!publicClient || !hyperDuelContractAddress) {
      setPlayerATotalUsd(null);
      setPlayerBTotalUsd(null);
      setMatchDetailsError(null);
      return;
    }

    if (playerA.toLowerCase() === zeroAddress || playerB.toLowerCase() === zeroAddress) {
      setPlayerATotalUsd(null);
      setPlayerBTotalUsd(null);
      setMatchDetailsError(null);
      return;
    }

    setIsLoadingMatchDetails(true);
    setMatchDetailsError(null);

    try {
      const [totalA, totalB] = (await Promise.all([
        publicClient.readContract({
          address: hyperDuelContractAddress,
          abi: hyperDuelAbi,
          functionName: 'getPlayerTotalUsd',
          args: [matchId, playerA],
        }),
        publicClient.readContract({
          address: hyperDuelContractAddress,
          abi: hyperDuelAbi,
          functionName: 'getPlayerTotalUsd',
          args: [matchId, playerB],
        }),
      ])) as [bigint, bigint];

      setPlayerATotalUsd(totalA);
      setPlayerBTotalUsd(totalB);
    } catch {
      setPlayerATotalUsd(null);
      setPlayerBTotalUsd(null);
      setMatchDetailsError('Could not load live winner details.');
    } finally {
      setIsLoadingMatchDetails(false);
    }
  }, [publicClient, hyperDuelContractAddress, matchId, playerA, playerB]);

  const loadSwapHistory = useCallback(async () => {
    if (!hyperDuelContractAddress) {
      setSwapHistoryRows([]);
      setSwapHistoryError(null);
      return;
    }

    setIsLoadingSwapHistory(true);
    setSwapHistoryError(null);

    try {
      if (!subgraphSwapHistoryUrl) {
        throw new Error('Missing VITE_GOLDSKY_SUBGRAPH_URL. Swap history is available only via Goldsky.');
      }
      const fromSubgraph = await fetchSwapHistoryFromSubgraph({
        endpoint: subgraphSwapHistoryUrl,
        matchId,
        limit: maxSubgraphSwapRows,
      });
      if (!fromSubgraph) {
        throw new Error('Could not fetch swap history from Goldsky subgraph.');
      }
      setSwapHistoryRows(fromSubgraph);
    } catch (error) {
      setSwapHistoryRows([]);
      setSwapHistoryError(error instanceof Error ? error.message : 'Could not load swap history.');
    } finally {
      setIsLoadingSwapHistory(false);
    }
  }, [hyperDuelContractAddress, matchId]);

  useEffect(() => {
    setSwapLegs((currentLegs) =>
      currentLegs.map((leg) => ({
        ...leg,
        tokenIn: selectableTokens.includes(leg.tokenIn) ? leg.tokenIn : (selectableTokens[0] ?? 0),
        tokenOut: selectableTokens.includes(leg.tokenOut) ? leg.tokenOut : (selectableTokens[1] ?? selectableTokens[0] ?? 0),
      })),
    );
  }, [selectableTokens]);

  useEffect(() => {
    void loadMatchDetails();
  }, [loadMatchDetails]);

  useEffect(() => {
    if (!isSwapConfirmed) return;
    void loadMatchDetails();
  }, [isSwapConfirmed, loadMatchDetails]);
  useEffect(() => {
    void loadSwapHistory();
  }, [loadSwapHistory]);
  useEffect(() => {
    if (!isSwapConfirmed) return;
    void loadSwapHistory();
  }, [isSwapConfirmed, loadSwapHistory]);
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const keepOpenElement = (target as HTMLElement).closest('[data-token-picker-interactive="true"]');
      if (!keepOpenElement) {
        setOpenPickerId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, []);

  const platformFeeBps = (platformFeeData as bigint | undefined) ?? 0n;
  const traderFeeBps = 30n;
  const platformFeePercent = Number(platformFeeBps) / 100;
  const traderFeePercent = Number(traderFeeBps) / 100;

  const simulationLegs = useMemo(() => {
    let previousOutAmount: bigint | null = null;
    const rows = swapLegs.map((leg, index) => {
      const usePreviousOutput = index > 0 && leg.usePreviousOutput;
      const tokenInPrice = tokenPriceById[leg.tokenIn];
      const tokenOutPrice = tokenPriceById[leg.tokenOut];
      if (!tokenInPrice || !tokenOutPrice || tokenOutPrice === 0n || leg.tokenIn === leg.tokenOut) {
        previousOutAmount = null;
        return {
          ...leg,
          usePreviousOutput,
          parsedAmountIn: null,
          grossAmountOut: null,
          feeInOutToken: null,
          amountOut: null,
          feeInUsd: null,
          isValid: false,
        };
      }

      let parsedAmountIn: bigint | null = null;
      if (usePreviousOutput) {
        parsedAmountIn = previousOutAmount;
      } else if (leg.amountIn) {
        try {
          parsedAmountIn = parseUnits(leg.amountIn, virtualAssetDecimals);
        } catch {
          parsedAmountIn = null;
        }
      }

      if (!parsedAmountIn || parsedAmountIn <= 0n) {
        previousOutAmount = null;
        return {
          ...leg,
          usePreviousOutput,
          parsedAmountIn: null,
          grossAmountOut: null,
          feeInOutToken: null,
          amountOut: null,
          feeInUsd: null,
          isValid: false,
        };
      }

      const grossOut = (parsedAmountIn * tokenInPrice) / tokenOutPrice;
      const feeInOutToken = (grossOut * traderFeeBps) / platformFeeBase;
      const amountOut = grossOut - feeInOutToken;
      const feeInUsd = (feeInOutToken * tokenOutPrice) / usdVirtualPriceScale;
      previousOutAmount = amountOut;

      return {
        ...leg,
        usePreviousOutput,
        parsedAmountIn,
        grossAmountOut: grossOut,
        feeInOutToken,
        amountOut,
        feeInUsd,
        isValid: true,
      };
    });

    return rows;
  }, [swapLegs, tokenPriceById, traderFeeBps]);

  const allLegsValid = simulationLegs.length > 0 && simulationLegs.every((leg) => leg.isValid && leg.parsedAmountIn && leg.amountOut);
  const hasAnyFilledSwapInput = simulationLegs.some((leg) => Boolean(leg.isValid && leg.parsedAmountIn && leg.amountOut));
  const isSwapLocked = disableSwap;
  const canSwap =
    isConnected &&
    Boolean(hyperDuelContractAddress) &&
    allLegsValid &&
    !isSwapLocked &&
    !isSwapPending &&
    !isConfirmingSwap;

  const onSwap = () => {
    if (!canSwap || !hyperDuelContractAddress) return;

    const tokenIns = simulationLegs.map((leg) => leg.tokenIn);
    const tokenOuts = simulationLegs.map((leg) => leg.tokenOut);
    const amountsIn = simulationLegs.map((leg) => leg.parsedAmountIn as bigint);

    writeSwap({
      address: hyperDuelContractAddress,
      abi: hyperDuelAbi,
      functionName: 'swap',
      args: [matchId, tokenIns, tokenOuts, amountsIn],
    });
  };

  const updateSwapLeg = (legId: number, patch: Partial<SwapDraftLeg>) => {
    setSwapLegs((current) => current.map((leg) => (leg.id === legId ? { ...leg, ...patch } : leg)));
  };
  const addSwapLeg = () => {
    setExpandedStepById({});
    setSwapLegs((current) => [
      ...current,
      {
        id: (current[current.length - 1]?.id ?? 0) + 1,
        tokenIn: selectableTokens[0] ?? 0,
        tokenOut: selectableTokens[1] ?? selectableTokens[0] ?? 0,
        amountIn: '',
        usePreviousOutput: true,
      },
    ]);
  };
  const removeSwapLeg = (legId: number) => {
    setSwapLegs((current) => {
      if (current.length === 1) return current;
      return current.filter((leg) => leg.id !== legId);
    });
  };

  const getTokenSymbol = (tokenId: number) => {
    if (tokenId === 0) return tokenSymbolByLabel.USD;
    const label = tokenLabelById[tokenId] ?? `Token ${tokenId}`;
    if (tokenSymbolByLabel[label]) return tokenSymbolByLabel[label];
    const normalized = label.replace(/[^a-zA-Z0-9]/g, '');
    if (/^[A-Z0-9]{2,8}$/.test(label)) return label;
    if (/^[A-Z0-9]{2,8}$/.test(normalized)) return normalized;
    const initials = label
      .split(/[\s_-]+/)
      .map((chunk) => chunk[0])
      .filter(Boolean)
      .join('')
      .toUpperCase();
    if (initials.length >= 2 && initials.length <= 8) return initials;
    return normalized.toUpperCase().slice(0, 6) || `T${tokenId}`;
  };
  const formatToken = (tokenId: number) => {
    if (tokenId === 0) return 'USD';
    const label = tokenLabelById[tokenId] ?? `Token ${tokenId}`;
    const symbol = getTokenSymbol(tokenId);
    return label === symbol ? symbol : `${label} (${symbol})`;
  };
  const renderTokenBadge = (tokenId: number) => {
    const symbol = getTokenSymbol(tokenId);
    const tokenLabel = tokenId === 0 ? 'USD' : tokenLabelById[tokenId] ?? symbol;
    const avatarUrl = tokenAvatarUrlByLabel[symbol] ?? tokenAvatarUrlByLabel[tokenLabel];
    const avatarKey = `${symbol}:${avatarUrl ?? 'none'}`;
    const showImage = Boolean(avatarUrl) && !failedAvatarByKey[avatarKey];
    const fallbackBackgroundBySymbol: Record<string, string> = {
      USD: '#dbeafe',
      BTC: '#ffedd5',
      ETH: '#e5e7eb',
      SOL: '#dcfce7',
      HYPE: '#ede9fe',
    };
    const fallbackBackground = fallbackBackgroundBySymbol[symbol] ?? '#e5e7eb';
    return (
      <span className="inline-flex items-center gap-1">
        <span
          className="relative inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-[#8f8f8f]"
          style={{ backgroundColor: showImage ? '#ffffff' : fallbackBackground }}
        >
          {showImage ? (
            <img
              src={avatarUrl as string}
              alt={`${symbol} logo`}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              onError={(event) => {
                setFailedAvatarByKey((current) => ({ ...current, [avatarKey]: true }));
              }}
            />
          ) : (
            <span className="font-mono text-[9px] font-black uppercase tracking-[0.02em] text-[#2f2f2f]">
              {symbol.slice(0, 3)}
            </span>
          )}
        </span>
        <span>{formatToken(tokenId)}</span>
      </span>
    );
  };
  const renderTokenIcon = (tokenId: number) => {
    const symbol = getTokenSymbol(tokenId);
    const tokenLabel = tokenId === 0 ? 'USD' : tokenLabelById[tokenId] ?? symbol;
    const avatarUrl = tokenAvatarUrlByLabel[symbol] ?? tokenAvatarUrlByLabel[tokenLabel];
    const avatarKey = `${symbol}:${avatarUrl ?? 'none'}`;
    const showImage = Boolean(avatarUrl) && !failedAvatarByKey[avatarKey];
    const fallbackBackgroundBySymbol: Record<string, string> = {
      USD: '#dbeafe',
      BTC: '#ffedd5',
      ETH: '#e5e7eb',
      SOL: '#dcfce7',
      HYPE: '#ede9fe',
    };
    const fallbackBackground = fallbackBackgroundBySymbol[symbol] ?? '#e5e7eb';

    return (
      <span
        className="relative inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-[#8f8f8f]"
        style={{ backgroundColor: showImage ? '#ffffff' : fallbackBackground }}
      >
        {showImage ? (
          <img
            src={avatarUrl as string}
            alt={`${symbol} logo`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            onError={() => {
              setFailedAvatarByKey((current) => ({ ...current, [avatarKey]: true }));
            }}
          />
        ) : (
          <span className="font-mono text-[9px] font-black uppercase tracking-[0.02em] text-[#2f2f2f]">
            {symbol.slice(0, 3)}
          </span>
        )}
      </span>
    );
  };
  const formatVirtualUsd = (value: bigint | null) => {
    if (value === null) return '-';
    const numeric = Number(formatUnits(value, virtualAssetDecimals));
    if (!Number.isFinite(numeric)) return compactNumber(formatUnits(value, virtualAssetDecimals));
    return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric)} vUSD`;
  };
  const liveWinnerLabel =
    playerATotalUsd === null || playerBTotalUsd === null
      ? 'Undecided'
      : playerATotalUsd === playerBTotalUsd
        ? 'Tie'
        : playerATotalUsd > playerBTotalUsd
          ? formatAddress(playerA)
          : formatAddress(playerB);
  const connectedAddress = address?.toLowerCase();
  const isConnectedPlayerA = Boolean(connectedAddress) && playerA.toLowerCase() === connectedAddress;
  const isConnectedPlayerB = Boolean(connectedAddress) && playerB.toLowerCase() === connectedAddress;
  const playersLabel = isConnectedPlayerA
    ? `YOU vs ${formatAddress(playerB)}`
    : isConnectedPlayerB
      ? `${formatAddress(playerA)} vs YOU`
      : `${formatAddress(playerA)} vs ${formatAddress(playerB)}`;
  const joinedPlayers =
    Number(playerA.toLowerCase() !== zeroAddress) +
    Number(playerB.toLowerCase() !== zeroAddress);
  const prizePoolGross = buyIn * BigInt(joinedPlayers);
  const prizePoolFeeAmount = (prizePoolGross * platformFeeBps) / platformFeeBase;
  const prizePoolNet = prizePoolGross - prizePoolFeeAmount;
  const platformFeesLabel = `${platformFeePercent.toFixed(platformFeePercent % 1 === 0 ? 0 : 2)}% (${compactNumber(formatUnits(prizePoolFeeAmount, buyInTokenDecimals))} ${buyInTokenSymbol})`;
  const estimatedAmountOut = simulationLegs[simulationLegs.length - 1]?.amountOut ?? null;
  const estimatedFeeInUsd = simulationLegs.reduce<bigint | null>((accumulator, leg) => {
    if (!leg.feeInUsd) return accumulator;
    return (accumulator ?? 0n) + leg.feeInUsd;
  }, null);
  const connectedPlayerTotalUsd =
    isConnectedPlayerA ? playerATotalUsd : isConnectedPlayerB ? playerBTotalUsd : null;
  const projectedConnectedTotalUsd = useMemo(() => {
    if (connectedPlayerTotalUsd === null || estimatedFeeInUsd === null) return null;
    return connectedPlayerTotalUsd > estimatedFeeInUsd ? connectedPlayerTotalUsd - estimatedFeeInUsd : 0n;
  }, [connectedPlayerTotalUsd, estimatedFeeInUsd]);
  const tokenPriceLabel = (tokenId: number) => {
    const tokenPrice = tokenPriceById[tokenId];
    if (!tokenPrice) return '...';
    return `$${compactNumber(formatUnits(tokenPrice, tokenPriceDecimals))}`;
  };
  const formatVirtualAmount = (amount: bigint | null | undefined) => {
    if (amount === null || amount === undefined) return '-';
    return compactNumber(formatUnits(amount, virtualAssetDecimals));
  };
  const formatSwapRateLabel = (amountIn: bigint, amountOut: bigint, tokenIn: number, tokenOut: number) => {
    if (amountIn <= 0n) return '-';
    const rateScaled = (amountOut * 10n ** 18n) / amountIn;
    const rate = compactNumber(formatUnits(rateScaled, 18));
    return `1 ${getTokenSymbol(tokenIn)} = ${rate} ${getTokenSymbol(tokenOut)}`;
  };
  const formatApproxUsdFromTokenAmount = (amount: bigint | null | undefined, tokenId: number) => {
    if (amount === null || amount === undefined) return '~ -';
    const price = tokenPriceById[tokenId];
    if (!price) return '~ -';
    const usdValue = (amount * price) / usdVirtualPriceScale;
    const numeric = Number(formatUnits(usdValue, virtualAssetDecimals));
    if (!Number.isFinite(numeric)) return `~ $${compactNumber(formatUnits(usdValue, virtualAssetDecimals))}`;
    return `~ $${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric)}`;
  };
  const firstLeg = simulationLegs[0];
  const lastLeg = simulationLegs[simulationLegs.length - 1];
  const exchangeRateLabel = useMemo(() => {
    if (!firstLeg || !lastLeg || !firstLeg.parsedAmountIn || !estimatedAmountOut || firstLeg.parsedAmountIn === 0n) return '-';
    const inPerOut = Number(formatUnits((estimatedAmountOut * 10n ** 18n) / firstLeg.parsedAmountIn, 18));
    if (!Number.isFinite(inPerOut)) return '-';
    return compactNumber(inPerOut.toFixed(8));
  }, [estimatedAmountOut, firstLeg, lastLeg]);

  return (
    <div className="space-y-3">
      {showMatchDetails ? (
        <div className="border border-[#b9b9b9] bg-[#f3f3f3] px-3 py-3">
          <div className="mb-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5a5a5a]">Match Details</div>
          <div className="grid gap-2 font-mono text-xs font-bold text-[#474747] md:grid-cols-2">
            <div><span className="text-[#666]">Players:</span> {playersLabel}</div>
            <div><span className="text-[#666]">Current Winner:</span> {isLoadingMatchDetails ? 'Loading...' : liveWinnerLabel}</div>
            <div>
              <span className="text-[#666]">Player A Total USD:</span>{' '}
              {formatVirtualUsd(playerATotalUsd)}
            </div>
            <div>
              <span className="text-[#666]">Player B Total USD:</span>{' '}
              {formatVirtualUsd(playerBTotalUsd)}
            </div>
            <div>
              <span className="text-[#666]">Prize Pool (Net):</span>{' '}
              {compactNumber(formatUnits(prizePoolNet, buyInTokenDecimals))} {buyInTokenSymbol}
            </div>
            <div><span className="text-[#666]">Platform Fees:</span> {platformFeesLabel}</div>
          </div>
          {matchDetailsError ? <div className="mt-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#9a4f4f]">{matchDetailsError}</div> : null}
        </div>
      ) : null}

      {isSwapLocked ? (
        <div className="border border-[#d4a2a2] bg-[#f8e6e6] px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#8a4747]">
          Match countdown ended. Conclude match.
        </div>
      ) : null}

      {!isSwapLocked ? (
      <div className="border border-[#b9b9b9] bg-[#f3f3f3] px-3 py-3">
        <div className="space-y-3">
          {simulationLegs.map((leg, index) => {
            const isExpanded = index === simulationLegs.length - 1 || Boolean(expandedStepById[leg.id]);
            return (
            <div key={leg.id} className="border border-[#c2c2c2] bg-[#f9f9f9] p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#5f5f5f]">
                  Swap {index + 1}
                </div>
                <div className="flex items-center gap-2">
                  {index < simulationLegs.length - 1 ? (
                    <button
                      type="button"
                      className="border border-[#b9b9b9] bg-[#f7f7f7] px-2 py-1 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-[#5d5d5d] hover:bg-[#ececec]"
                      onClick={() =>
                        setExpandedStepById((current) => ({
                          ...current,
                          [leg.id]: !isExpanded,
                        }))
                      }
                    >
                      {isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  ) : null}
                  {simulationLegs.length > 1 ? (
                    <button
                      type="button"
                      className="border border-[#b9b9b9] bg-[#f7f7f7] px-2 py-1 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-[#5d5d5d] hover:bg-[#ececec]"
                      onClick={() => removeSwapLeg(leg.id)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
              {isExpanded ? (
              <>
              <div className="space-y-3">
                <div className="border border-[#b9b9b9] bg-[#f8f8f8]">
                  <div className="px-3 pt-3 font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#666]">Sell</div>
                  <div className="grid gap-3 px-3 pb-3 pt-2 md:grid-cols-[minmax(0,1fr)_220px]">
                    <div>
                      <input
                        className="w-full bg-transparent font-mono text-4xl font-black text-[#2f2f2f] outline-none placeholder:text-[#9a9a9a] disabled:text-[#7f7f7f]"
                        type="text"
                        placeholder={leg.usePreviousOutput ? 'Auto' : '0.0'}
                        value={leg.amountIn}
                        disabled={leg.usePreviousOutput}
                        onChange={(event) => updateSwapLeg(leg.id, { amountIn: event.target.value })}
                      />
                      <div className="mt-1 font-mono text-sm font-bold text-[#666]">
                        {formatApproxUsdFromTokenAmount(leg.parsedAmountIn, leg.tokenIn)}
                      </div>
                    </div>
                    <div className="relative" data-token-picker-interactive="true">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between border border-[#b9b9b9] bg-[#f3f3f3] px-3 py-2 text-left font-mono text-sm font-bold text-[#474747] hover:bg-[#efefef]"
                        onClick={() => setOpenPickerId((current) => (current === `in-${leg.id}` ? null : `in-${leg.id}`))}
                      >
                        {renderTokenBadge(leg.tokenIn)}
                        <span className="text-[#666]">▾</span>
                      </button>
                      {openPickerId === `in-${leg.id}` ? (
                        <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto border border-[#b9b9b9] bg-[#f7f7f7] p-1 shadow-[0_8px_18px_rgba(0,0,0,0.12)]" data-token-picker-interactive="true">
                          {selectableTokens.map((tokenId) => (
                            <button
                              key={`in-option-${leg.id}-${tokenId}`}
                              type="button"
                              className="flex w-full items-center justify-between px-2 py-2 text-left hover:bg-[#ece9ff]"
                              onClick={() => {
                                updateSwapLeg(leg.id, { tokenIn: tokenId });
                                setOpenPickerId(null);
                              }}
                            >
                              <span className="font-mono text-xs font-bold text-[#474747]">{renderTokenBadge(tokenId)}</span>
                              {tokenId === leg.tokenIn ? <span className="font-mono text-[10px] font-black text-[#433d98]">Selected</span> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-1 font-mono text-[11px] font-bold text-[#666]">
                        Balance: {formatVirtualAmount(virtualBalanceByTokenId[leg.tokenIn] ?? 0n)} {getTokenSymbol(leg.tokenIn)}
                      </div>
                    </div>
                  </div>
                  {leg.parsedAmountIn !== null && leg.parsedAmountIn > (virtualBalanceByTokenId[leg.tokenIn] ?? 0n) ? (
                    <div className="border-t border-[#db3030] bg-[#ff4b4b] px-3 py-1 font-mono text-xs font-black text-white">
                      Not enough amount
                    </div>
                  ) : null}
                </div>

                <div className="flex justify-center">
                  <button
                    type="button"
                    className="h-10 w-10 border border-[#b9b9b9] bg-[#f3f3f3] font-mono text-2xl font-black text-[#666] hover:bg-[#ececec]"
                    onClick={() => {
                      updateSwapLeg(leg.id, { tokenIn: leg.tokenOut, tokenOut: leg.tokenIn });
                      setOpenPickerId(null);
                    }}
                  >
                    ↕
                  </button>
                </div>

                <div className="border border-[#b9b9b9] bg-[#f8f8f8]">
                  <div className="px-3 pt-3 font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#666]">Buy</div>
                  <div className="grid gap-3 px-3 pb-3 pt-2 md:grid-cols-[minmax(0,1fr)_220px]">
                    <div>
                      <div className="font-mono text-4xl font-black text-[#2f2f2f]">
                        {formatVirtualAmount(leg.amountOut)}
                      </div>
                      <div className="mt-1 font-mono text-sm font-bold text-[#666]">
                        {formatApproxUsdFromTokenAmount(leg.amountOut, leg.tokenOut)}
                      </div>
                    </div>
                    <div className="relative" data-token-picker-interactive="true">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between border border-[#b9b9b9] bg-[#f3f3f3] px-3 py-2 text-left font-mono text-sm font-bold text-[#474747] hover:bg-[#efefef]"
                        onClick={() => setOpenPickerId((current) => (current === `out-${leg.id}` ? null : `out-${leg.id}`))}
                      >
                        {renderTokenBadge(leg.tokenOut)}
                        <span className="text-[#666]">▾</span>
                      </button>
                      {openPickerId === `out-${leg.id}` ? (
                        <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto border border-[#b9b9b9] bg-[#f7f7f7] p-1 shadow-[0_8px_18px_rgba(0,0,0,0.12)]" data-token-picker-interactive="true">
                          {selectableTokens.map((tokenId) => (
                            <button
                              key={`out-option-${leg.id}-${tokenId}`}
                              type="button"
                              className="flex w-full items-center justify-between px-2 py-2 text-left hover:bg-[#ece9ff]"
                              onClick={() => {
                                updateSwapLeg(leg.id, { tokenOut: tokenId });
                                setOpenPickerId(null);
                              }}
                            >
                              <span className="font-mono text-xs font-bold text-[#474747]">{renderTokenBadge(tokenId)}</span>
                              {tokenId === leg.tokenOut ? <span className="font-mono text-[10px] font-black text-[#433d98]">Selected</span> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-1 font-mono text-[11px] font-bold text-[#666]">
                        Balance: {formatVirtualAmount(virtualBalanceByTokenId[leg.tokenOut] ?? 0n)} {getTokenSymbol(leg.tokenOut)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {index > 0 ? (
                <label className="mt-2 flex items-center gap-2 font-mono text-xs font-bold text-[#5f5f5f]">
                  <input
                    type="checkbox"
                    checked={leg.usePreviousOutput}
                    onChange={(event) => updateSwapLeg(leg.id, { usePreviousOutput: event.target.checked })}
                  />
                  Use previous step output as this step input
                </label>
              ) : null}

              {leg.isValid ? (
                <div className="mt-2 font-mono text-xs font-bold text-[#555]">
                  {`${formatVirtualAmount(leg.parsedAmountIn)} ${getTokenSymbol(leg.tokenIn)} -> ${formatVirtualAmount(leg.amountOut)} ${getTokenSymbol(leg.tokenOut)}`}
                </div>
              ) : null}
              {leg.tokenIn === leg.tokenOut ? (
                <div className="mt-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#9a4f4f]">
                  Sell and Buy token must be different.
                </div>
              ) : null}
              <div className="mt-1 font-mono text-[11px] font-bold text-[#666]">
                Price: {getTokenSymbol(leg.tokenIn)} {tokenPriceLabel(leg.tokenIn)} {'->'} {getTokenSymbol(leg.tokenOut)} {tokenPriceLabel(leg.tokenOut)}
              </div>
              <div className="mt-1 font-mono text-[11px] font-bold text-[#666]">
                Swap Fee: {traderFeePercent.toFixed(traderFeePercent % 1 === 0 ? 0 : 2)}%
              </div>
              </>
              ) : (
                <div className="grid gap-2 border border-[#b9b9b9] bg-[#f5f5f5] px-3 py-2 font-mono text-xs font-bold text-[#4e4e4e] md:grid-cols-3">
                  <div>
                    Route: {renderTokenBadge(leg.tokenIn)} {'->'} {renderTokenBadge(leg.tokenOut)}
                  </div>
                  <div>
                    Amounts: {formatVirtualAmount(leg.parsedAmountIn)} {getTokenSymbol(leg.tokenIn)} {'->'} {formatVirtualAmount(leg.amountOut)} {getTokenSymbol(leg.tokenOut)}
                  </div>
                  <div>
                    Price: {tokenPriceLabel(leg.tokenIn)} {'->'} {tokenPriceLabel(leg.tokenOut)}
                  </div>
                </div>
              )}
            </div>
          )})}
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="border border-[#b9b9b9] bg-[#f7f7f7] px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#4f4f4f] hover:bg-[#ececec]"
            onClick={addSwapLeg}
          >
            Add Swap
          </button>
        </div>

        {hasAnyFilledSwapInput ? (
          <div className="mt-3 grid gap-2 border border-[#c2c2c2] bg-[#f9f9f9] px-3 py-3 font-mono text-xs font-bold text-[#4a4a4a] md:grid-cols-2">
            <div><span className="text-[#666]">Swap Fee:</span> {traderFeePercent.toFixed(traderFeePercent % 1 === 0 ? 0 : 2)}%</div>
            <div><span className="text-[#666]">Swaps:</span> {simulationLegs.length}</div>
            <div>
              <span className="text-[#666]">Price In (Swap 1):</span>{' '}
              {renderTokenBadge(simulationLegs[0]?.tokenIn ?? 0)} {tokenPriceLabel(simulationLegs[0]?.tokenIn ?? 0)}
            </div>
            <div>
              <span className="text-[#666]">Price Out (Last):</span>{' '}
              {renderTokenBadge(simulationLegs[simulationLegs.length - 1]?.tokenOut ?? 0)} {tokenPriceLabel(simulationLegs[simulationLegs.length - 1]?.tokenOut ?? 0)}
            </div>
            <div>
              <span className="text-[#666]">Estimated Final Output:</span>{' '}
              {estimatedAmountOut === null
                ? '-'
                : `${compactNumber(formatUnits(estimatedAmountOut, virtualAssetDecimals))} ${getTokenSymbol(simulationLegs[simulationLegs.length - 1]?.tokenOut ?? 0)}`}
            </div>
            <div>
              <span className="text-[#666]">Estimated Total Swap Fees:</span>{' '}
              {estimatedFeeInUsd === null ? '-' : `${compactNumber(formatUnits(estimatedFeeInUsd, virtualAssetDecimals))} vUSD`}
            </div>
            <div>
              <span className="text-[#666]">Exchange Rate (incl. fees):</span>{' '}
              {firstLeg && lastLeg ? `${getTokenSymbol(firstLeg.tokenIn)}/${getTokenSymbol(lastLeg.tokenOut)} ${exchangeRateLabel}` : '-'}
            </div>
            <div>
              <span className="text-[#666]">Trade routed through:</span>{' '}
              {simulationLegs.map((leg) => `${getTokenSymbol(leg.tokenIn)}→${getTokenSymbol(leg.tokenOut)}`).join(' • ')}
            </div>
            <div><span className="text-[#666]">Estimated TX cost:</span> -</div>
            <div><span className="text-[#666]">Slippage:</span> 0.03%</div>
            <div className="md:col-span-2">
              <span className="text-[#666]">Projected Your Total:</span>{' '}
              {projectedConnectedTotalUsd === null
                ? 'Connect as a match player to simulate post-swap outcome'
                : `${formatVirtualUsd(connectedPlayerTotalUsd)} -> ${formatVirtualUsd(projectedConnectedTotalUsd)}`}
            </div>
          </div>
        ) : null}
      </div>
      ) : null}

      {!isSwapLocked ? (
        <>
          {swapError ? <div className="break-all font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#9a4f4f]">{swapError.message}</div> : null}
          {swapHash ? <div className="break-all font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#447056]">Swap Tx: {swapHash}</div> : null}

          <div className="flex justify-end">
            <button
              type="button"
              className={`border px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] ${
                canSwap
                  ? 'border-[#8f83ff] bg-[#ece9ff] text-[#433d98] hover:bg-[#e3deff]'
                  : 'cursor-not-allowed border-[#c8c8c8] bg-[#f1f1f1] text-[#9a9a9a]'
              }`}
              onClick={onSwap}
              disabled={!canSwap}
            >
              {isSwapPending ? 'Confirm In Wallet' : isConfirmingSwap ? 'Swapping...' : 'Swap'}
            </button>
          </div>
        </>
      ) : null}

      <div className="border border-[#b9b9b9] bg-[#f3f3f3] px-3 py-3">
        <div className="mb-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5a5a5a]">Recent Swap History</div>
        {isLoadingSwapHistory ? (
          <div className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#666]">Loading swap history...</div>
        ) : swapHistoryError ? (
          <div className="break-all font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#9a4f4f]">{swapHistoryError}</div>
        ) : swapHistoryRows.length === 0 ? (
          <div className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#666]">No swaps in this match yet.</div>
        ) : (
          <div className="space-y-2">
            {swapHistoryRows.map((row, index) => (
              <div key={`${row.transactionHash ?? 'tx'}-${row.logIndex}-${index}`} className="border border-[#c8c8c8] bg-[#f9f9f9] px-2.5 py-2">
                <div className="flex items-center gap-2 font-mono text-[11px] font-black text-[#4f4f4f]">
                  {renderTokenIcon(row.tokenIn)}
                  <span>{formatVirtualAmount(row.amountIn)}</span>
                  <span>{'->'}</span>
                  {renderTokenIcon(row.tokenOut)}
                  <span>{formatVirtualAmount(row.amountOut)}</span>
                </div>
                <div className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#666]">
                  Rate: {formatSwapRateLabel(row.amountIn, row.amountOut, row.tokenIn, row.tokenOut)}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#666]">
                  <span>
                    Player:{' '}
                    {connectedAddress && row.player.toLowerCase() === connectedAddress ? 'YOU' : formatAddress(row.player)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
