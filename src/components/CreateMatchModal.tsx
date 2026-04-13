import { useEffect, useMemo } from 'react';
import { parseUnits, type Address } from 'viem';
import { useAccount, useChainId, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { erc20AllowanceAbi, hyperDuelAbi } from '../config/abis';
import { hyperDuelContractByChainId, tokenIndexByChainId, zeroAddress } from '../config/contracts';
import { formatSpotPriceLabel } from '../utils/format';
import { PanelLabel, PixelButton, PixelInput, PixelSelectButton, PixelSlider, PixelToggleChip } from './pixel';
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
  onClose: () => void;
}) {
  const chainId = useChainId();
  const hyperDuelContractAddress = hyperDuelContractByChainId[chainId];
  const tokenIndexMap = tokenIndexByChainId[chainId] ?? {};
  const { isConnected, address } = useAccount();
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

  const { data: spotPricesData } = useReadContracts({
    contracts:
      hyperDuelContractAddress && availableAssets.length > 0
        ? availableAssets.map((asset) => ({
            address: hyperDuelContractAddress,
            abi: hyperDuelAbi,
            functionName: 'spotPx',
            args: [asset.index],
          }))
        : [],
    query: {
      enabled: Boolean(hyperDuelContractAddress && availableAssets.length > 0),
    },
  });

  const { data: tokenDecimalsData } = useReadContracts({
    contracts:
      hyperDuelContractAddress && availableAssets.length > 0
        ? availableAssets.map((asset) => ({
            address: hyperDuelContractAddress,
            abi: hyperDuelAbi,
            functionName: 'tradingTokens',
            args: [asset.index],
          }))
        : [],
    query: {
      enabled: Boolean(hyperDuelContractAddress && availableAssets.length > 0),
    },
  });

  const spotPriceByAssetLabel = useMemo(() => {
    return availableAssets.reduce<Record<string, bigint | null>>((accumulator, asset, index) => {
      const result = spotPricesData?.[index]?.result;
      accumulator[asset.label] = typeof result === 'bigint' ? result : null;
      return accumulator;
    }, {});
  }, [availableAssets, spotPricesData]);

  const tokenDecimalsByAssetLabel = useMemo(() => {
    return availableAssets.reduce<Record<string, number | null>>((accumulator, asset, index) => {
      const result = tokenDecimalsData?.[index]?.result;
      accumulator[asset.label] = typeof result === 'number' ? result : null;
      return accumulator;
    }, {});
  }, [availableAssets, tokenDecimalsData]);

  useEffect(() => {
    if (isCreateConfirmed) {
      onClose();
    }
  }, [isCreateConfirmed, onClose]);

  useEffect(() => {
    if (!isApproveConfirmed) return;
    void refetchAllowance();
  }, [isApproveConfirmed, refetchAllowance]);

  if (!isOpen) return null;

  const isReservedMatch = matchCreationMode === 'reserved';
  const hasAssetSelection = tokensAllowed.length > 0;
  const hasUnknownAssetSelection = tokensAllowed.length !== selectedAssets.length;
  const allowanceAmount = allowanceData ? BigInt(allowanceData as bigint) : 0n;
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

  const handleApproveToken = () => {
    if (!canApprove || !buyInTokenAddress || !hyperDuelContractAddress) return;
    writeApprove({
      address: buyInTokenAddress as Address,
      abi: erc20AllowanceAbi,
      functionName: 'approve',
      args: [hyperDuelContractAddress, buyInAmount],
    });
  };

  const handleConfirmMatch = () => {
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

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#0d1a3f]/80 px-4 py-8">
      <div className="flex min-h-full items-start justify-center">
        <div className="w-full max-w-xl border-4 border-[#4a261a] bg-[#20325f] shadow-[0_8px_0_0_#3a1d14]">
        <div className="flex items-center justify-between gap-4 border-b-4 border-[#4a261a] bg-[#6f3b1e] px-4 py-3 md:px-5">
          <div>
            <div className="font-mono text-2xl font-black uppercase text-[#ffd88a]">Create Match</div>
            <div className="font-mono text-xs font-bold uppercase text-[#fff2cf]">
              Choose your buy-in and match duration
            </div>
          </div>
          <PixelButton variant="blue" className="px-3 py-1 text-sm" onClick={onClose}>
            Close
          </PixelButton>
        </div>

        <div className="space-y-6 p-4 md:p-5">
          <div>
            <PanelLabel>Allowed Assets</PanelLabel>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {availableAssets.map((asset) => (
                <PixelToggleChip
                  key={asset.label}
                  label={asset.label}
                  subtitle={formatSpotPriceLabel(spotPriceByAssetLabel[asset.label], tokenDecimalsByAssetLabel[asset.label])}
                  dotClass={asset.color}
                  active={selectedAssets.includes(asset.label)}
                  onClick={() => onAssetsChange(asset.label)}
                />
              ))}
            </div>
            {availableAssets.length === 0 ? (
              <p className="mt-3 font-mono text-xs font-bold leading-5 text-[#ff8f7f]">
                No token index mapping configured for this network yet.
              </p>
            ) : null}
          </div>

          <div>
            <PanelLabel>Creation Mode</PanelLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              <PixelSelectButton active={matchCreationMode === 'empty'} onClick={() => onMatchCreationModeChange('empty')}>
                Empty Match
              </PixelSelectButton>
              <PixelSelectButton
                active={matchCreationMode === 'creator-joins'}
                onClick={() => onMatchCreationModeChange('creator-joins')}
              >
                Creator Joins As Player A
              </PixelSelectButton>
              <PixelSelectButton active={matchCreationMode === 'reserved'} onClick={() => onMatchCreationModeChange('reserved')}>
                Reserved Match
              </PixelSelectButton>
            </div>
            <p className="mt-3 font-mono text-xs font-bold leading-5 text-slate-300">
              Choose whether the match starts empty, starts with the creator as Player A, or is created with both Player A and Player B pre-set.
            </p>
            {isReservedMatch ? (
              <div className="mt-3 space-y-2">
                <PixelInput
                  placeholder="0x... Player B address"
                  value={reservedOpponentAddress}
                  onChange={onReservedOpponentAddressChange}
                />
                {trimmedReservedOpponentAddress && !reservedAddressIsValid ? (
                  <p className="font-mono text-xs font-bold leading-5 text-[#ff8f7f]">
                    Enter a valid wallet address to create a reserved match.
                  </p>
                ) : null}
                <p className="font-mono text-xs font-bold leading-5 text-slate-300">
                  Your wallet is set as Player A, and this address is set as Player B at creation.
                </p>
              </div>
            ) : (
              <p className="mt-3 font-mono text-xs font-bold leading-5 text-slate-300">
                Player B remains open, so any valid wallet can join once the match is created.
              </p>
            )}
          </div>

          <div>
            <PanelLabel>Buy-in (USDC)</PanelLabel>
            {buyInBalanceLabel ? (
              <div className="mt-2 font-mono text-xs font-bold uppercase text-[#ffefb0]">
                Your balance: {buyInBalanceLabel}
              </div>
            ) : null}
            <div className="mt-3">
              <PixelSlider
                min={buyInRange.min}
                max={buyInRange.max}
                step={buyInRange.step}
                value={selectedBuyIn}
                onChange={onBuyInChange}
                valueLabel={`${selectedBuyIn} USDC`}
              />
            </div>
          </div>

          <div>
            <PanelLabel>Duration</PanelLabel>
            <div className="mt-3">
              <PixelSlider
                min={durationRange.min}
                max={durationRange.max}
                step={durationRange.step}
                value={selectedDurationHours}
                onChange={onDurationChange}
                valueLabel={selectedDuration}
              />
            </div>
          </div>

          <div className="border-4 border-[#26315f] bg-[#131d44] px-4 py-4 shadow-[0_4px_0_0_#162141]">
            <div className="font-mono text-sm font-black uppercase text-[#ffefb0]">Match Summary</div>
            <div className="mt-3 grid gap-3 font-mono text-sm font-bold text-white sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className="text-slate-300">Allowed assets:</span> {selectedAssets.join(' • ')}
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-300">Mode:</span>{' '}
                {matchCreationMode === 'empty'
                  ? 'Empty match, no player joins at creation'
                  : matchCreationMode === 'creator-joins'
                    ? 'Creator joins immediately as Player A'
                    : 'Reserved match with Player A and Player B pre-set'}
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-300">Player B:</span>{' '}
                {isReservedMatch
                  ? `Reserved for ${reservedOpponentAddress || 'a selected address'}`
                  : 'Open to any valid player later'}
              </div>
              <div>
                <span className="text-slate-300">Buy-in:</span> {selectedBuyIn} USDC
              </div>
              <div>
                <span className="text-slate-300">Duration:</span> {selectedDuration}
              </div>
            </div>
          </div>

          <div className="border-4 border-[#26315f] bg-[#10173a] px-4 py-3 font-mono text-xs font-bold uppercase text-slate-200 shadow-[0_4px_0_0_#162141]">
            <div>Contract: {hyperDuelContractAddress}</div>
            <div className="mt-2">
              Action: createMatch(playerA, playerB, tokensAllowed, buyIn, duration)
            </div>
            {!isConnected ? <div className="mt-2 text-[#ff8f7f]">Connect a wallet to create a match.</div> : null}
            {isConnected && !hyperDuelContractAddress ? (
              <div className="mt-2 text-[#ff8f7f]">No HyperDuel contract configured for this network.</div>
            ) : null}
            {isConnected && requiresAllowance && !hasEnoughAllowance ? (
              <div className="mt-2 text-[#ff8f7f]">Approve buy-in token before creating this match.</div>
            ) : null}
            {hasUnknownAssetSelection ? (
              <div className="mt-2 text-[#ff8f7f]">One or more selected assets is missing a contract token id mapping.</div>
            ) : null}
            {approveError ? <div className="mt-2 break-all text-[#ff8f7f]">{approveError.message}</div> : null}
            {createMatchError ? <div className="mt-2 break-all text-[#ff8f7f]">{createMatchError.message}</div> : null}
            {approveHash ? <div className="mt-2 break-all text-[#7fffb2]">Approve Tx: {approveHash}</div> : null}
            {createMatchHash ? <div className="mt-2 break-all text-[#7fffb2]">Match Tx: {createMatchHash}</div> : null}
            {isConfirmingApprove ? <div className="mt-2 text-[#ffefb0]">Waiting for approve confirmation...</div> : null}
            {isConfirmingCreate ? <div className="mt-2 text-[#ffefb0]">Waiting for match confirmation...</div> : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <PixelButton variant="blue" onClick={onClose}>
              Cancel
            </PixelButton>
            {requiresAllowance && !hasEnoughAllowance ? (
              <PixelButton variant="green" onClick={handleApproveToken} disabled={!canApprove}>
                {isApprovePending
                  ? 'Confirm Approve In Wallet'
                  : isConfirmingApprove
                    ? 'Approving Token...'
                    : 'Approve Token'}
              </PixelButton>
            ) : null}
            <PixelButton variant="gold" onClick={handleConfirmMatch} disabled={!canSubmit}>
              {isCreatePending ? 'Confirm In Wallet' : isConfirmingCreate ? 'Creating Match...' : 'Confirm Match'}
            </PixelButton>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
