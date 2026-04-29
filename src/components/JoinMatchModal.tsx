import { useEffect } from 'react';
import { formatUnits, type Address } from 'viem';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { erc20AllowanceAbi, hyperDuelAbi } from '../config/abis';
import { compactNumber } from '../utils/format';
import { emitBalanceRefresh } from '../utils/appEvents';
import { type Match } from '../types/match';

const platformFeeBase = 10_000n;

export function JoinMatchModal({
  isOpen,
  match,
  buyInTokenAddress,
  buyInTokenSymbol,
  buyInTokenDecimals,
  hyperDuelContractAddress,
  onJoined,
  onClose,
}: {
  isOpen: boolean;
  match: Match | null;
  buyInTokenAddress?: Address;
  buyInTokenSymbol: string;
  buyInTokenDecimals: number;
  hyperDuelContractAddress?: Address;
  onJoined: (matchId: bigint) => void;
  onClose: () => void;
}) {
  const { isConnected, address } = useAccount();
  const {
    data: approveHash,
    error: approveError,
    isPending: isApprovePending,
    writeContract: writeApprove,
  } = useWriteContract();
  const {
    data: joinHash,
    error: joinError,
    isPending: isJoinPending,
    writeContract: writeJoin,
  } = useWriteContract();
  const { isLoading: isConfirmingApprove, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({
    hash: approveHash,
  });
  const { isLoading: isConfirmingJoin, isSuccess: isJoinConfirmed } = useWaitForTransactionReceipt({
    hash: joinHash,
  });

  const matchBuyIn = match?.buyInRaw ?? 0n;

  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: buyInTokenAddress,
    abi: erc20AllowanceAbi,
    functionName: 'allowance',
    args:
      address && hyperDuelContractAddress
        ? [address as Address, hyperDuelContractAddress]
        : undefined,
    query: {
      enabled: Boolean(isOpen && isConnected && address && buyInTokenAddress && hyperDuelContractAddress && match),
    },
  });
  const { data: platformFeeData } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'platformFeePercentage',
    query: {
      enabled: Boolean(hyperDuelContractAddress),
    },
  });

  useEffect(() => {
    if (!isApproveConfirmed) return;
    void refetchAllowance();
  }, [isApproveConfirmed, refetchAllowance]);

  useEffect(() => {
    if (!isJoinConfirmed || !match) return;
    emitBalanceRefresh();
    onJoined(match.matchId);
    onClose();
  }, [isJoinConfirmed, match, onClose, onJoined]);

  if (!isOpen || !match) return null;

  const allowanceAmount = allowanceData ? BigInt(allowanceData as bigint) : 0n;
  const hasEnoughAllowance = allowanceAmount >= matchBuyIn;
  const platformFeeBps = (platformFeeData as bigint | undefined) ?? 0n;
  const grossPrize = matchBuyIn * 2n;
  const platformFeeAmount = (grossPrize * platformFeeBps) / platformFeeBase;
  const netPrize = grossPrize - platformFeeAmount;

  const canApprove =
    isConnected &&
    !isApprovePending &&
    !isConfirmingApprove &&
    !hasEnoughAllowance &&
    Boolean(buyInTokenAddress) &&
    Boolean(hyperDuelContractAddress);

  const canJoin =
    isConnected &&
    match.statusCode === 0 &&
    !isJoinPending &&
    !isConfirmingJoin &&
    hasEnoughAllowance &&
    Boolean(hyperDuelContractAddress);

  const handleApprove = () => {
    if (!canApprove || !buyInTokenAddress || !hyperDuelContractAddress) return;
    writeApprove({
      address: buyInTokenAddress,
      abi: erc20AllowanceAbi,
      functionName: 'approve',
      args: [hyperDuelContractAddress, matchBuyIn],
    });
  };

  const handleJoin = () => {
    if (!canJoin || !hyperDuelContractAddress) return;
    writeJoin({
      address: hyperDuelContractAddress,
      abi: hyperDuelAbi,
      functionName: 'joinMatch',
      args: [match.matchId],
    });
  };

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-black/30 px-4 py-8">
      <div className="flex min-h-full items-start justify-center">
        <div className="w-full max-w-lg border border-[#ababab] bg-[#f5f5f5] shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between gap-4 border-b border-[#bdbdbd] bg-[#ebebeb] px-4 py-3 md:px-5">
            <div>
              <div className="font-mono text-2xl font-black uppercase tracking-[0.08em] text-[#2f2f2f]">Join Match</div>
              <div className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#6a6a6a]">{match.id}</div>
            </div>
            <button
              type="button"
              className="border border-[#b9b9b9] bg-[#f7f7f7] px-3 py-1 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#4f4f4f] hover:bg-[#ececec]"
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <div className="space-y-4 p-4 md:p-5">
            <div className="border border-[#b9b9b9] bg-[#f9f9f9] px-4 py-4 font-mono text-sm font-bold text-[#424242]">
              <div><span className="text-[#6c6c6c]">Assets:</span> {match.assets}</div>
              <div className="mt-2"><span className="text-[#6c6c6c]">Buy-in:</span> {compactNumber(formatUnits(matchBuyIn, buyInTokenDecimals))} {buyInTokenSymbol}</div>
              <div className="mt-2">
                <span className="text-[#6c6c6c]">Prize:</span>{' '}
                {compactNumber(formatUnits(netPrize, buyInTokenDecimals))} {buyInTokenSymbol}
              </div>
              <div className="mt-2">
                <span className="text-[#6c6c6c]">Platform Fee:</span>{' '}
                {compactNumber(formatUnits(platformFeeAmount, buyInTokenDecimals))} {buyInTokenSymbol}
              </div>
              <div className="mt-2"><span className="text-[#6c6c6c]">Duration:</span> {match.duration}</div>
            </div>

            <div className="border border-[#b9b9b9] bg-[#f1f1f1] px-4 py-3 font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#5e5e5e]">
              {!isConnected ? <div className="text-[#9a4f4f]">Connect a wallet to join this match.</div> : null}
              {match.statusCode !== 0 ? <div className="text-[#9a4f4f]">This match is no longer joinable.</div> : null}
              {isConnected && !hasEnoughAllowance ? (
                <div className="text-[#9a4f4f]">Approve {buyInTokenSymbol} before joining.</div>
              ) : null}
              {approveHash ? <div className="mt-2 break-all text-[#447056]">Approve Tx: {approveHash}</div> : null}
              {joinHash ? <div className="mt-2 break-all text-[#447056]">Join Tx: {joinHash}</div> : null}
              {isConfirmingApprove ? <div className="mt-2 text-[#6a6194]">Waiting for approve confirmation...</div> : null}
              {isConfirmingJoin ? <div className="mt-2 text-[#6a6194]">Waiting for join confirmation...</div> : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="border border-[#b9b9b9] bg-[#f7f7f7] px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#4f4f4f] hover:bg-[#ececec]"
                onClick={onClose}
              >
                Cancel
              </button>
              {!hasEnoughAllowance ? (
                <button
                  type="button"
                  className={`border px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] ${
                    canApprove
                      ? 'border-[#8f83ff] bg-[#ece9ff] text-[#433d98] hover:bg-[#e3deff]'
                      : 'cursor-not-allowed border-[#c8c8c8] bg-[#f1f1f1] text-[#9a9a9a]'
                  }`}
                  onClick={handleApprove}
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
                  canJoin
                    ? 'border-[#8f83ff] bg-[#ece9ff] text-[#433d98] hover:bg-[#e3deff]'
                    : 'cursor-not-allowed border-[#c8c8c8] bg-[#f1f1f1] text-[#9a9a9a]'
                }`}
                onClick={handleJoin}
                disabled={!canJoin}
              >
                {isJoinPending ? 'Confirm In Wallet' : isConfirmingJoin ? 'Joining Match...' : 'Join Match'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
