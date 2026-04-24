import { useEffect, useMemo, useState } from 'react';
import { parseUnits, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { erc20AllowanceAbi, hyperDuelAbi } from '../config/abis';
import {
  hyperDuelContractByChainId,
  tokenIndexByChainId,
  zeroAddress,
} from '../config/contracts';
import { formatSpotPriceLabel } from '../utils/format';
import { emitBalanceRefresh } from '../utils/appEvents';
import { type MatchCreationMode } from '../types/match';

const buyInRange = {
  min: 10,
  max: 500,
  step: 5,
};

const durationRange = {
  min: 1,
  max: 72,
  step: 1,
};

function getErrorText(error: unknown, depth = 0): string {
  if (!error || depth > 3) return '';
  if (typeof error === 'string') return error;
  if (typeof error !== 'object') return '';

  const value = error as { shortMessage?: unknown; message?: unknown; cause?: unknown };
  const ownText = [value.shortMessage, value.message].filter((part): part is string => typeof part === 'string').join(' ');
  const causeText = getErrorText(value.cause, depth + 1);
  return `${ownText} ${causeText}`.trim();
}

function isUserRejectedError(error: unknown): boolean {
  const text = getErrorText(error).toLowerCase();
  return (
    text.includes('user rejected') ||
    text.includes('user denied') ||
    text.includes('denied transaction signature') ||
    text.includes('rejected the request') ||
    text.includes('request rejected')
  );
}

function readBigIntLike(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.length > 0) {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

export function CreateMatchModal({
  isOpen,
  availableAssets,
  buyInBalanceLabel,
  selectedBuyIn,
  selectedDuration,
  selectedAssets,
  matchCreationMode,
  reservedOpponentAddress,
  onAssetsChange,
  onBuyInChange,
  selectedDurationHours,
  onDurationChange,
  onMatchCreationModeChange,
  onReservedOpponentAddressChange,
  onCreated,
  onClose,
}: {
  isOpen: boolean;
  availableAssets: Array<{ label: string; color: string; index: number }>;
  buyInBalanceLabel: string | null;
  selectedBuyIn: number;
  selectedDuration: string;
  selectedAssets: string[];
  matchCreationMode: MatchCreationMode;
  reservedOpponentAddress: string;
  onAssetsChange: (asset: string) => void;
  onBuyInChange: (buyIn: number) => void;
  selectedDurationHours: number;
  onDurationChange: (duration: number) => void;
  onMatchCreationModeChange: (value: MatchCreationMode) => void;
  onReservedOpponentAddressChange: (value: string) => void;
  onCreated: () => void;
  onClose: () => void;
}) {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const hyperDuelContractAddress = hyperDuelContractByChainId[chainId];
  const tokenIndexMap = tokenIndexByChainId[chainId] ?? {};
  const { isConnected, address } = useAccount();
  const [fallbackSpotByAssetLabel, setFallbackSpotByAssetLabel] = useState<Record<string, bigint | null>>({});
  const [fallbackDecimalsByAssetLabel, setFallbackDecimalsByAssetLabel] = useState<Record<string, number | null>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    data: createMatchHash,
    error: createMatchError,
    isPending: isCreatePending,
    writeContract: writeCreateMatch,
  } = useWriteContract();
  const {
    data: approveHash,
    error: approveError,
    isPending: isApprovePending,
    writeContract: writeApprove,
  } = useWriteContract();
  const { isLoading: isConfirmingCreate, isSuccess: isCreateConfirmed } = useWaitForTransactionReceipt({
    hash: createMatchHash,
  });
  const { isLoading: isConfirmingApprove, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const tokensAllowed = useMemo(
    () => selectedAssets.map((asset) => tokenIndexMap[asset]).filter((tokenId): tokenId is number => tokenId !== undefined),
    [selectedAssets, tokenIndexMap],
  );
  const buyInAmount = useMemo(() => parseUnits(selectedBuyIn.toString(), 6), [selectedBuyIn]);
  const durationInSeconds = useMemo(() => BigInt(selectedDurationHours * 60 * 60), [selectedDurationHours]);
  const trimmedReservedOpponentAddress = reservedOpponentAddress.trim();
  const reservedAddressIsValid = /^0x[a-fA-F0-9]{40}$/.test(trimmedReservedOpponentAddress);

  const requiresAllowance = matchCreationMode !== 'empty';

  const { data: buyInTokenAddress } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'buyInToken',
    query: {
      enabled: Boolean(hyperDuelContractAddress && isConnected && requiresAllowance),
    },
  });

  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: buyInTokenAddress as Address | undefined,
    abi: erc20AllowanceAbi,
    functionName: 'allowance',
    args:
      address && hyperDuelContractAddress
        ? [address as Address, hyperDuelContractAddress]
        : undefined,
    query: {
      enabled: Boolean(
        requiresAllowance &&
          address &&
          hyperDuelContractAddress &&
          buyInTokenAddress,
      ),
    },
  });

  const { data: tokenPricesData } = useReadContracts({
    contracts:
      hyperDuelContractAddress && availableAssets.length > 0
        ? availableAssets.map((asset) => ({
            address: hyperDuelContractAddress,
            chainId,
            abi: hyperDuelAbi,
            functionName: 'tokenPx',
            args: [tokenIndexMap[asset.label] ?? asset.index],
          }))
        : [],
    query: {
      enabled: Boolean(isOpen && hyperDuelContractAddress && availableAssets.length > 0),
    },
  });

  const { data: tokenDecimalsData } = useReadContracts({
    contracts:
      hyperDuelContractAddress && availableAssets.length > 0
        ? availableAssets.map((asset) => ({
            address: hyperDuelContractAddress,
            chainId,
            abi: hyperDuelAbi,
            functionName: 'tradingTokens',
            args: [tokenIndexMap[asset.label] ?? asset.index],
          }))
        : [],
    query: {
      enabled: Boolean(isOpen && hyperDuelContractAddress && availableAssets.length > 0),
    },
  });

  const spotPriceByAssetLabel = useMemo(() => {
    return availableAssets.reduce<Record<string, bigint | null>>((accumulator, asset, index) => {
      const result = tokenPricesData?.[index]?.result;
      if (typeof result === 'bigint') {
        accumulator[asset.label] = result;
      } else if (typeof result === 'number' && Number.isFinite(result)) {
        accumulator[asset.label] = BigInt(result);
      } else {
        accumulator[asset.label] = null;
      }
      return accumulator;
    }, {});
  }, [availableAssets, tokenPricesData]);

  const tokenDecimalsByAssetLabel = useMemo(() => {
    return availableAssets.reduce<Record<string, number | null>>((accumulator, asset, index) => {
      const result = tokenDecimalsData?.[index]?.result;
      if (typeof result === 'number' && Number.isFinite(result)) {
        accumulator[asset.label] = result;
      } else if (typeof result === 'bigint') {
        accumulator[asset.label] = Number(result);
      } else {
        accumulator[asset.label] = null;
      }
      return accumulator;
    }, {});
  }, [availableAssets, tokenDecimalsData]);

  useEffect(() => {
    if (!isOpen || !publicClient || !hyperDuelContractAddress || availableAssets.length === 0) {
      return;
    }

    let cancelled = false;
    const fetchMissingValues = async () => {
      const missingAssets = availableAssets.filter((asset) => {
        const spot = spotPriceByAssetLabel[asset.label];
        const decimals = tokenDecimalsByAssetLabel[asset.label];
        return spot === null || decimals === null;
      });

      if (missingAssets.length === 0) {
        setFallbackSpotByAssetLabel((current) => (Object.keys(current).length === 0 ? current : {}));
        setFallbackDecimalsByAssetLabel((current) => (Object.keys(current).length === 0 ? current : {}));
        return;
      }

      const fallbackSpot: Record<string, bigint | null> = {};
      const fallbackDecimals: Record<string, number | null> = {};

      await Promise.all(
        missingAssets.map(async (asset) => {
          const tokenIndex = tokenIndexMap[asset.label] ?? asset.index;
          if (spotPriceByAssetLabel[asset.label] === null) {
            try {
              const rawSpot = await publicClient.readContract({
                address: hyperDuelContractAddress,
                abi: hyperDuelAbi,
                functionName: 'tokenPx',
                args: [tokenIndex],
              });
              fallbackSpot[asset.label] =
                typeof rawSpot === 'bigint'
                  ? rawSpot
                  : typeof rawSpot === 'number' && Number.isFinite(rawSpot)
                    ? BigInt(rawSpot)
                    : null;
            } catch (error) {
              fallbackSpot[asset.label] = null;
            }
          }

          if (tokenDecimalsByAssetLabel[asset.label] === null) {
            try {
              const rawDecimals = await publicClient.readContract({
                address: hyperDuelContractAddress,
                abi: hyperDuelAbi,
                functionName: 'tradingTokens',
                args: [tokenIndex],
              });
              fallbackDecimals[asset.label] =
                typeof rawDecimals === 'number' && Number.isFinite(rawDecimals)
                  ? rawDecimals
                  : typeof rawDecimals === 'bigint'
                    ? Number(rawDecimals)
                    : null;
            } catch (error) {
              fallbackDecimals[asset.label] = null;
            }
          }
        }),
      );

      if (cancelled) return;
      setFallbackSpotByAssetLabel(fallbackSpot);
      setFallbackDecimalsByAssetLabel(fallbackDecimals);
    };

    void fetchMissingValues();

    return () => {
      cancelled = true;
    };
  }, [
    availableAssets,
    chainId,
    hyperDuelContractAddress,
    isOpen,
    publicClient,
    spotPriceByAssetLabel,
    tokenDecimalsByAssetLabel,
    tokenIndexMap,
  ]);

  const resolvedSpotByAssetLabel = useMemo(
    () =>
      availableAssets.reduce<Record<string, bigint | null>>((accumulator, asset) => {
        accumulator[asset.label] = spotPriceByAssetLabel[asset.label] ?? fallbackSpotByAssetLabel[asset.label] ?? null;
        return accumulator;
      }, {}),
    [availableAssets, fallbackSpotByAssetLabel, spotPriceByAssetLabel],
  );

  const resolvedDecimalsByAssetLabel = useMemo(
    () =>
      availableAssets.reduce<Record<string, number | null>>((accumulator, asset) => {
        accumulator[asset.label] = tokenDecimalsByAssetLabel[asset.label] ?? fallbackDecimalsByAssetLabel[asset.label] ?? null;
        return accumulator;
      }, {}),
    [availableAssets, fallbackDecimalsByAssetLabel, tokenDecimalsByAssetLabel],
  );

  useEffect(() => {
    if (isCreateConfirmed) {
      emitBalanceRefresh();
      onCreated();
      onClose();
    }
  }, [isCreateConfirmed, onClose, onCreated]);

  useEffect(() => {
    if (!isApproveConfirmed) return;
    void refetchAllowance();
  }, [isApproveConfirmed, refetchAllowance]);

  if (!isOpen) return null;

  const isReservedMatch = matchCreationMode === 'reserved';
  const isEmptyMatch = matchCreationMode === 'empty';
  const hasAssetSelection = tokensAllowed.length > 0;
  const hasUnknownAssetSelection = tokensAllowed.length !== selectedAssets.length;
  const allowanceAmount = readBigIntLike(allowanceData);
  const hasEnoughAllowance = !requiresAllowance || allowanceAmount >= buyInAmount;
  const canApprove =
    isConnected &&
    !isApprovePending &&
    !isConfirmingApprove &&
    requiresAllowance &&
    !hasEnoughAllowance &&
    Boolean(buyInTokenAddress) &&
    Boolean(hyperDuelContractAddress);

  const canSubmit =
    isConnected &&
    Boolean(hyperDuelContractAddress) &&
    !isCreatePending &&
    !isConfirmingCreate &&
    hasAssetSelection &&
    !hasUnknownAssetSelection &&
    hasEnoughAllowance &&
    (!isReservedMatch || reservedAddressIsValid);

  const approveErrorText =
    actionError ??
    (approveError
      ? isUserRejectedError(approveError)
        ? 'Approve transaction cancelled in wallet.'
        : getErrorText(approveError) || 'Approve transaction failed.'
      : null);

  const createErrorText = createMatchError
    ? isUserRejectedError(createMatchError)
      ? 'Create match transaction cancelled in wallet.'
      : getErrorText(createMatchError) || 'Create match transaction failed.'
    : null;

  const handleApproveToken = () => {
    setActionError(null);
    if (!canApprove || !buyInTokenAddress || !hyperDuelContractAddress) {
      if (!isConnected) {
        setActionError('Connect a wallet before approving token.');
      } else if (!buyInTokenAddress) {
        setActionError('Buy-in token is still loading, retry in a moment.');
      } else if (!hyperDuelContractAddress) {
        setActionError('No HyperDuel contract configured for this network.');
      } else if (hasEnoughAllowance) {
        setActionError('Allowance already sufficient for the selected buy-in.');
      }
      return;
    }

    writeApprove({
      chainId,
      address: buyInTokenAddress as Address,
      abi: erc20AllowanceAbi,
      functionName: 'approve',
      args: [hyperDuelContractAddress, buyInAmount],
    });
  };

  const handleConfirmMatch = () => {
    setActionError(null);
    if (!canSubmit || !hyperDuelContractAddress || !address) return;

    const playerA = matchCreationMode === 'empty' ? zeroAddress : (address as Address);
    const playerB = matchCreationMode === 'reserved' ? (trimmedReservedOpponentAddress as Address) : zeroAddress;

    writeCreateMatch({
      address: hyperDuelContractAddress,
      abi: hyperDuelAbi,
      functionName: 'createMatch',
      args: [playerA, playerB, tokensAllowed, buyInAmount, durationInSeconds],
    });
  };

  const modeButtonClass = (active: boolean) =>
    `border px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] ${
      active
        ? 'border-[#8f83ff] bg-[#ece9ff] text-[#433d98]'
        : 'border-[#b9b9b9] bg-[#f8f8f8] text-[#4d4d4d] hover:bg-[#eeeeee]'
    }`;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-black/30 px-4 py-8">
      <div className="flex min-h-full items-start justify-center">
        <div className="w-full max-w-xl border border-[#ababab] bg-[#f5f5f5] text-[#2f2f2f] shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between gap-4 border-b border-[#bdbdbd] bg-[#ebebeb] px-4 py-3 md:px-5">
            <div>
              <div className="font-mono text-2xl font-black uppercase tracking-[0.08em] text-[#2f2f2f]">Create Match</div>
              <div className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#6a6a6a]">
                Choose your buy-in and match duration
              </div>
            </div>
            <button
              type="button"
              className="border border-[#b9b9b9] bg-[#f7f7f7] px-3 py-1 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#4f4f4f] hover:bg-[#ececec]"
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <div className="space-y-6 p-4 md:p-5">
            <div>
              <div className="font-mono text-sm font-black uppercase tracking-[0.08em] text-[#4f4f4f]">Allowed Assets</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
              {availableAssets.map((asset) => (
                  <button
                    key={asset.label}
                    type="button"
                    onClick={() => onAssetsChange(asset.label)}
                    className={`flex items-center justify-between gap-2 border px-3 py-2 text-left font-mono text-sm font-black uppercase tracking-[0.08em] ${
                      selectedAssets.includes(asset.label)
                        ? 'border-[#8f83ff] bg-[#ece9ff] text-[#433d98]'
                        : 'border-[#b9b9b9] bg-[#f9f9f9] text-[#4f4f4f] hover:bg-[#efefef]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`h-3 w-3 border border-black ${asset.color}`} />
                      <span>{asset.label}</span>
                    </span>
                    <span className="text-[10px] font-bold normal-case tracking-normal text-[#666]">
                      {formatSpotPriceLabel(resolvedSpotByAssetLabel[asset.label], resolvedDecimalsByAssetLabel[asset.label])}
                    </span>
                  </button>
              ))}
              </div>
              {availableAssets.length === 0 ? (
                <p className="mt-3 font-mono text-xs font-bold leading-5 text-[#9a4f4f]">
                  No token index mapping configured for this network yet.
                </p>
              ) : null}
            </div>

            <div>
              <div className="font-mono text-sm font-black uppercase tracking-[0.08em] text-[#4f4f4f]">Creation Mode</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="border border-[#b9b9b9] bg-[#f9f9f9] p-3">
                  <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#6a6a6a]">Player A</div>
                  <div
                    className={`mt-2 border px-3 py-3 font-mono text-sm font-black uppercase tracking-[0.08em] ${
                      isEmptyMatch
                        ? 'border-[#b9b9b9] bg-[#f4f4f4] text-[#5f5f5f]'
                        : 'border-[#8f83ff] bg-[#ece9ff] text-[#433d98]'
                    }`}
                  >
                    {isEmptyMatch ? 'Any player can join' : 'YOU'}
                  </div>
                </div>

                <div className="border border-[#b9b9b9] bg-[#f9f9f9] p-3">
                  <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#6a6a6a]">Player B</div>
                  {isReservedMatch ? (
                    <div className="mt-2 space-y-2">
                      <input
                        className="w-full border border-[#8f83ff] bg-[#f4f2ff] px-3 py-2 font-mono text-sm font-bold text-[#3f3a8a] outline-none placeholder:text-[#8f88bf]"
                        placeholder="0x... reserved address"
                        value={reservedOpponentAddress}
                        onChange={(event) => onReservedOpponentAddressChange(event.target.value)}
                      />
                      {trimmedReservedOpponentAddress && !reservedAddressIsValid ? (
                        <p className="font-mono text-[11px] font-bold leading-5 text-[#9a4f4f]">
                          Enter a valid wallet address for Player B.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-2 border border-[#b9b9b9] bg-[#f4f4f4] px-3 py-3 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#5f5f5f]">
                      Any player can join
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={modeButtonClass(matchCreationMode === 'empty')} onClick={() => onMatchCreationModeChange('empty')}>
                  Empty Match
                </button>
                <button
                  type="button"
                  className={modeButtonClass(matchCreationMode === 'creator-joins')}
                  onClick={() => onMatchCreationModeChange('creator-joins')}
                >
                  Creator Joins As Player A
                </button>
                <button type="button" className={modeButtonClass(matchCreationMode === 'reserved')} onClick={() => onMatchCreationModeChange('reserved')}>
                  Reserved Match
                </button>
              </div>
              <p className="mt-3 font-mono text-xs font-bold leading-5 text-[#5f5f5f]">
                Choose whether the match starts empty, starts with the creator as Player A, or is created with both Player A and Player B pre-set.
              </p>
              <p className="mt-2 font-mono text-xs font-bold leading-5 text-[#5f5f5f]">
                {isEmptyMatch
                  ? 'Both slots stay open and anyone can fill Player A and Player B later.'
                  : isReservedMatch
                    ? 'You lock in as Player A now and explicitly reserve Player B.'
                    : 'You lock in as Player A now, while Player B remains open for anyone to join.'}
              </p>
            </div>

            <div>
              <div className="font-mono text-sm font-black uppercase tracking-[0.08em] text-[#4f4f4f]">Buy-in (USDC)</div>
              {buyInBalanceLabel ? (
                <div className="mt-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#5f5f5f]">
                  Your balance: {buyInBalanceLabel}
                </div>
              ) : null}
              <div className="mt-3 border border-[#b9b9b9] bg-[#f9f9f9] px-3 py-3">
                <div className="mb-2 flex items-center justify-between font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5f5f5f]">
                  <span>{buyInRange.min}</span>
                  <span className="text-sm text-[#3f3f3f]">{selectedBuyIn} USDC</span>
                  <span>{buyInRange.max}</span>
                </div>
                <input
                  className="slider h-3 w-full cursor-pointer appearance-none border border-[#b9b9b9] bg-[#e8e8e8]"
                  type="range"
                  min={buyInRange.min}
                  max={buyInRange.max}
                  step={buyInRange.step}
                  value={selectedBuyIn}
                  onChange={(event) => onBuyInChange(Number(event.target.value))}
                />
              </div>
            </div>

            <div>
              <div className="font-mono text-sm font-black uppercase tracking-[0.08em] text-[#4f4f4f]">Duration</div>
              <div className="mt-3 border border-[#b9b9b9] bg-[#f9f9f9] px-3 py-3">
                <div className="mb-2 flex items-center justify-between font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5f5f5f]">
                  <span>{durationRange.min}</span>
                  <span className="text-sm text-[#3f3f3f]">{selectedDuration}</span>
                  <span>{durationRange.max}</span>
                </div>
                <input
                  className="slider h-3 w-full cursor-pointer appearance-none border border-[#b9b9b9] bg-[#e8e8e8]"
                  type="range"
                  min={durationRange.min}
                  max={durationRange.max}
                  step={durationRange.step}
                  value={selectedDurationHours}
                  onChange={(event) => onDurationChange(Number(event.target.value))}
                />
              </div>
            </div>

            <div className="border border-[#b9b9b9] bg-[#f9f9f9] px-4 py-4">
              <div className="font-mono text-sm font-black uppercase tracking-[0.08em] text-[#4f4f4f]">Match Summary</div>
              <div className="mt-3 grid gap-3 font-mono text-sm font-bold text-[#454545] sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <span className="text-[#666]">Allowed assets:</span> {selectedAssets.join(' • ')}
                </div>
                <div className="sm:col-span-2">
                  <span className="text-[#666]">Mode:</span>{' '}
                  {matchCreationMode === 'empty'
                    ? 'Empty match, no player joins at creation'
                    : matchCreationMode === 'creator-joins'
                      ? 'Creator joins immediately as Player A'
                      : 'Reserved match with Player A and Player B pre-set'}
                </div>
                <div className="sm:col-span-2">
                  <span className="text-[#666]">Player B:</span>{' '}
                  {isReservedMatch
                    ? `Reserved for ${reservedOpponentAddress || 'a selected address'}`
                    : 'Open to any valid player later'}
                </div>
                <div>
                  <span className="text-[#666]">Buy-in:</span> {selectedBuyIn} USDC
                </div>
                <div>
                  <span className="text-[#666]">Duration:</span> {selectedDuration}
                </div>
              </div>
            </div>

            <div className="border border-[#b9b9b9] bg-[#f1f1f1] px-4 py-3 font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#5e5e5e]">
              <div>Contract: {hyperDuelContractAddress}</div>
              <div className="mt-2">
                Action: createMatch(playerA, playerB, tokensAllowed, buyIn, duration)
              </div>
              {!isConnected ? <div className="mt-2 text-[#9a4f4f]">Connect a wallet to create a match.</div> : null}
              {isConnected && !hyperDuelContractAddress ? (
                <div className="mt-2 text-[#9a4f4f]">No HyperDuel contract configured for this network.</div>
              ) : null}
              {isConnected && requiresAllowance && !hasEnoughAllowance ? (
                <div className="mt-2 text-[#9a4f4f]">Approve buy-in token before creating this match.</div>
              ) : null}
              {hasUnknownAssetSelection ? (
                <div className="mt-2 text-[#9a4f4f]">One or more selected assets is missing a contract token id mapping.</div>
              ) : null}
              {approveHash ? <div className="mt-2 break-all text-[#447056]">Approve Tx: {approveHash}</div> : null}
              {createMatchHash ? <div className="mt-2 break-all text-[#447056]">Match Tx: {createMatchHash}</div> : null}
              {isConfirmingApprove ? <div className="mt-2 text-[#6a6194]">Waiting for approve confirmation...</div> : null}
              {isConfirmingCreate ? <div className="mt-2 text-[#6a6194]">Waiting for match confirmation...</div> : null}
              {approveErrorText ? <div className="mt-2 normal-case tracking-normal text-[#9a4f4f]">{approveErrorText}</div> : null}
              {createErrorText ? <div className="mt-2 normal-case tracking-normal text-[#9a4f4f]">{createErrorText}</div> : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="border border-[#b9b9b9] bg-[#f7f7f7] px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#4f4f4f] hover:bg-[#ececec]"
                onClick={onClose}
              >
                Cancel
              </button>
              {requiresAllowance && !hasEnoughAllowance ? (
                <button
                  type="button"
                  className={`border px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] ${
                    canApprove
                      ? 'border-[#8f83ff] bg-[#ece9ff] text-[#433d98] hover:bg-[#e3deff]'
                      : 'cursor-not-allowed border-[#c8c8c8] bg-[#f1f1f1] text-[#9a9a9a]'
                  }`}
                  onClick={handleApproveToken}
                  disabled={!canApprove}
                >
                  {isApprovePending
                    ? 'Confirm Approve In Wallet'
                    : isConfirmingApprove
                      ? 'Approving Token...'
                      : 'Approve Token'}
                </button>
              ) : null}
              <button
                type="button"
                className={`border px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] ${
                  canSubmit
                    ? 'border-[#8f83ff] bg-[#ece9ff] text-[#433d98] hover:bg-[#e3deff]'
                    : 'cursor-not-allowed border-[#c8c8c8] bg-[#f1f1f1] text-[#9a9a9a]'
                }`}
                onClick={handleConfirmMatch}
                disabled={!canSubmit}
              >
                {isCreatePending ? 'Confirm In Wallet' : isConfirmingCreate ? 'Creating Match...' : 'Confirm Match'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
