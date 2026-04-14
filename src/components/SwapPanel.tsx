import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatUnits, parseUnits, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { hyperDuelAbi, hyperDuelSwapEvent } from '../config/abis';
import {
  swapHistoryLookbackBlocks,
  zeroAddress,
} from '../config/contracts';
import { compactNumber, formatAddress } from '../utils/format';
import { type SwapHistoryEntry } from '../types/match';

const virtualAssetDecimals = 18;

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
}) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const selectableTokens = useMemo(() => [0, ...tokensAllowed], [tokensAllowed]);
  const [tokenIn, setTokenIn] = useState<number>(selectableTokens[0] ?? 0);
  const [tokenOut, setTokenOut] = useState<number>(selectableTokens[1] ?? selectableTokens[0] ?? 0);
  const [amountIn, setAmountIn] = useState('');
  const [swapHistory, setSwapHistory] = useState<SwapHistoryEntry[]>([]);
  const [isLoadingSwapHistory, setIsLoadingSwapHistory] = useState(false);
  const [swapHistoryError, setSwapHistoryError] = useState<string | null>(null);
  const [playerATotalUsd, setPlayerATotalUsd] = useState<bigint | null>(null);
  const [playerBTotalUsd, setPlayerBTotalUsd] = useState<bigint | null>(null);
  const [isLoadingMatchDetails, setIsLoadingMatchDetails] = useState(false);
  const [matchDetailsError, setMatchDetailsError] = useState<string | null>(null);

  const {
    data: swapHash,
    error: swapError,
    isPending: isSwapPending,
    writeContract: writeSwap,
  } = useWriteContract();
  const { isLoading: isConfirmingSwap, isSuccess: isSwapConfirmed } = useWaitForTransactionReceipt({
    hash: swapHash,
  });

  const { data: tokenDecimalsData } = useReadContracts({
    contracts:
      hyperDuelContractAddress && tokensAllowed.length > 0
        ? tokensAllowed.map((tokenId) => ({
            address: hyperDuelContractAddress,
            chainId,
            abi: hyperDuelAbi,
            functionName: 'tradingTokens',
            args: [tokenId],
          }))
        : [],
    query: {
      enabled: Boolean(hyperDuelContractAddress && tokensAllowed.length > 0),
    },
  });

  const tokenDecimalsById = useMemo(() => {
    const map: Record<number, number> = { 0: 8 };
    tokensAllowed.forEach((tokenId, index) => {
      const result = tokenDecimalsData?.[index]?.result;
      if (typeof result === 'number' && Number.isFinite(result)) {
        map[tokenId] = result;
      } else if (typeof result === 'bigint') {
        map[tokenId] = Number(result);
      } else {
        map[tokenId] = 8;
      }
    });
    return map;
  }, [tokenDecimalsData, tokensAllowed]);

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
    if (!publicClient || !hyperDuelContractAddress) {
      setSwapHistory([]);
      setSwapHistoryError(null);
      return;
    }

    setIsLoadingSwapHistory(true);
    setSwapHistoryError(null);

    try {
      const latestBlock = await publicClient.getBlockNumber();
      const fromBlock = latestBlock > swapHistoryLookbackBlocks ? latestBlock - swapHistoryLookbackBlocks : 0n;

      const logs = await publicClient.getLogs({
        address: hyperDuelContractAddress,
        event: hyperDuelSwapEvent,
        fromBlock,
        toBlock: latestBlock,
      });

      const logsForMatch = logs.filter((log) => log.args.matchId === matchId);
      const uniqueBlockNumbers = Array.from(new Set(logsForMatch.map((log) => log.blockNumber)));
      const blockResults = await Promise.all(
        uniqueBlockNumbers.map(async (blockNumber) => {
          const block = await publicClient.getBlock({ blockNumber });
          return [blockNumber, block.timestamp] as const;
        }),
      );
      const timestampByBlockNumber = new Map(blockResults);

      const mappedHistory: SwapHistoryEntry[] = logsForMatch
        .map((log) => {
          const args = log.args;
          const txHash = log.transactionHash;
          const blockNumber = log.blockNumber;
          const player = args.player;
          const tokenIn = args.tokenIn;
          const tokenOut = args.tokenOut;
          const amountIn = args.amountIn;
          const amountOut = args.amountOut;

          if (
            !txHash ||
            blockNumber === null ||
            !player ||
            tokenIn === undefined ||
            tokenOut === undefined ||
            amountIn === undefined ||
            amountOut === undefined
          ) {
            return null;
          }

          return {
            txHash,
            blockNumber,
            timestamp: timestampByBlockNumber.get(blockNumber) ?? null,
            player,
            tokenIn: Number(tokenIn),
            tokenOut: Number(tokenOut),
            amountIn,
            amountOut,
          };
        })
        .filter((value): value is SwapHistoryEntry => value !== null)
        .sort((a, b) => Number(b.blockNumber - a.blockNumber));

      setSwapHistory(mappedHistory);
    } catch {
      setSwapHistoryError('Could not load swap history from chain logs.');
      setSwapHistory([]);
    } finally {
      setIsLoadingSwapHistory(false);
    }
  }, [publicClient, hyperDuelContractAddress, matchId]);

  useEffect(() => {
    if (!selectableTokens.includes(tokenIn)) {
      setTokenIn(selectableTokens[0] ?? 0);
    }
    if (!selectableTokens.includes(tokenOut)) {
      setTokenOut(selectableTokens[1] ?? selectableTokens[0] ?? 0);
    }
  }, [selectableTokens, tokenIn, tokenOut]);

  useEffect(() => {
    void loadSwapHistory();
  }, [loadSwapHistory]);

  useEffect(() => {
    void loadMatchDetails();
  }, [loadMatchDetails]);

  useEffect(() => {
    if (!isSwapConfirmed) return;
    void loadSwapHistory();
    void loadMatchDetails();
  }, [isSwapConfirmed, loadMatchDetails, loadSwapHistory]);

  const parsedAmountIn = useMemo(() => {
    if (!amountIn) return null;
    try {
      // Contract virtual balances are tracked with 18 decimals for all assets.
      return parseUnits(amountIn, virtualAssetDecimals);
    } catch {
      return null;
    }
  }, [amountIn]);

  const canSwap =
    isConnected &&
    Boolean(hyperDuelContractAddress) &&
    tokenIn !== tokenOut &&
    parsedAmountIn !== null &&
    parsedAmountIn > 0n &&
    !isSwapPending &&
    !isConfirmingSwap;

  const onSwap = () => {
    if (!canSwap || !hyperDuelContractAddress || !parsedAmountIn) return;
    writeSwap({
      address: hyperDuelContractAddress,
      abi: hyperDuelAbi,
      functionName: 'swap',
      args: [matchId, [tokenIn], [tokenOut], [parsedAmountIn]],
    });
  };

  const formatToken = (tokenId: number) => (tokenId === 0 ? 'USD' : tokenLabelById[tokenId] ?? `T${tokenId}`);
  const formatPlayerAddress = (value: Address) => `${value.slice(0, 6)}...${value.slice(-4)}`;
  const formatSwapTimestamp = (timestamp: bigint | null) =>
    timestamp === null ? 'Unknown time' : new Date(Number(timestamp) * 1000).toLocaleString();
  const liveWinnerLabel =
    playerATotalUsd === null || playerBTotalUsd === null
      ? 'Undecided'
      : playerATotalUsd === playerBTotalUsd
        ? 'Tie'
        : playerATotalUsd > playerBTotalUsd
          ? formatAddress(playerA)
          : formatAddress(playerB);
  const joinedPlayers =
    Number(playerA.toLowerCase() !== zeroAddress) +
    Number(playerB.toLowerCase() !== zeroAddress);
  const prizePoolGross = buyIn * BigInt(joinedPlayers);
  const platformFeesLabel = 'N/A';

  return (
    <div className="space-y-3">
      <div className="border border-[#b9b9b9] bg-[#f3f3f3] px-3 py-3">
        <div className="mb-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5a5a5a]">Match Details</div>
        <div className="grid gap-2 font-mono text-xs font-bold text-[#474747] md:grid-cols-2">
          <div><span className="text-[#666]">Players:</span> {formatAddress(playerA)} vs {formatAddress(playerB)}</div>
          <div><span className="text-[#666]">Current Winner:</span> {isLoadingMatchDetails ? 'Loading...' : liveWinnerLabel}</div>
          <div>
            <span className="text-[#666]">Player A Total USD:</span>{' '}
            {playerATotalUsd === null ? '-' : compactNumber(formatUnits(playerATotalUsd, 8))}
          </div>
          <div>
            <span className="text-[#666]">Player B Total USD:</span>{' '}
            {playerBTotalUsd === null ? '-' : compactNumber(formatUnits(playerBTotalUsd, 8))}
          </div>
          <div>
            <span className="text-[#666]">Prize Pool (Gross):</span>{' '}
            {compactNumber(formatUnits(prizePoolGross, buyInTokenDecimals))} {buyInTokenSymbol}
          </div>
          <div><span className="text-[#666]">Platform Fees:</span> {platformFeesLabel}</div>
        </div>
        {matchDetailsError ? <div className="mt-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#9a4f4f]">{matchDetailsError}</div> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <select
          className="border border-[#b9b9b9] bg-[#f8f8f8] px-3 py-2 font-mono text-sm font-bold text-[#474747]"
          value={tokenIn}
          onChange={(event) => setTokenIn(Number(event.target.value))}
        >
          {selectableTokens.map((tokenId) => (
            <option key={`in-${tokenId}`} value={tokenId}>
              {tokenId === 0 ? 'USD (Virtual)' : tokenLabelById[tokenId] ?? `T${tokenId}`}
            </option>
          ))}
        </select>

        <select
          className="border border-[#b9b9b9] bg-[#f8f8f8] px-3 py-2 font-mono text-sm font-bold text-[#474747]"
          value={tokenOut}
          onChange={(event) => setTokenOut(Number(event.target.value))}
        >
          {selectableTokens.map((tokenId) => (
            <option key={`out-${tokenId}`} value={tokenId}>
              {tokenId === 0 ? 'USD (Virtual)' : tokenLabelById[tokenId] ?? `T${tokenId}`}
            </option>
          ))}
        </select>

        <input
          className="w-full border border-[#b9b9b9] bg-[#f8f8f8] px-3 py-2 font-mono text-sm font-bold text-[#404040] outline-none placeholder:text-[#999]"
          type="text"
          placeholder="Amount in"
          value={amountIn}
          onChange={(event) => setAmountIn(event.target.value)}
        />
      </div>

      {tokenIn === tokenOut ? (
        <div className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#9a4f4f]">Select different tokens.</div>
      ) : null}
      {amountIn && parsedAmountIn === null ? (
        <div className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#9a4f4f]">Enter a valid amount.</div>
      ) : null}
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

      <div className="border border-[#b9b9b9] bg-[#f3f3f3] px-3 py-3">
        <div className="mb-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5a5a5a]">Recent Swap History</div>
        {isLoadingSwapHistory ? (
          <div className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#666]">Loading swaps...</div>
        ) : swapHistoryError ? (
          <div className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#9a4f4f]">{swapHistoryError}</div>
        ) : swapHistory.length === 0 ? (
          <div className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#666]">
            No recent Swap events found for this match.
          </div>
        ) : (
          <div className="space-y-2">
            {swapHistory.slice(0, 12).map((entry) => (
              <div
                key={`${entry.txHash}-${entry.blockNumber.toString()}`}
                className="border border-[#c2c2c2] bg-[#f9f9f9] px-3 py-2 font-mono text-xs text-[#444]"
              >
                <div className="font-bold text-[#4f4f4f]">{formatPlayerAddress(entry.player)}</div>
                <div className="mt-1 text-[#555]">
                  {compactNumber(formatUnits(entry.amountIn, tokenDecimalsById[entry.tokenIn] ?? 8))} {formatToken(entry.tokenIn)} →{' '}
                  {compactNumber(formatUnits(entry.amountOut, tokenDecimalsById[entry.tokenOut] ?? 8))} {formatToken(entry.tokenOut)}
                </div>
                <div className="mt-1 text-[#777]">{formatSwapTimestamp(entry.timestamp)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
