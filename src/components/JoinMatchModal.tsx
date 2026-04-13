import { useEffect } from 'react';
import { formatUnits, type Address } from 'viem';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { erc20AllowanceAbi, hyperDuelAbi } from '../config/abis';
import { compactNumber } from '../utils/format';
import { PixelButton } from './pixel';
import { type Match } from '../types/match';

export function JoinMatchModal({
  isOpen,
  match,
  buyInTokenAddress,
  buyInTokenSymbol,
  buyInTokenDecimals,
  hyperDuelContractAddress,
  onClose,
}: {
  isOpen: boolean;
  match: Match | null;
  buyInTokenAddress?: Address;
  buyInTokenSymbol: string;
  buyInTokenDecimals: number;
  hyperDuelContractAddress?: Address;
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

  useEffect(() => {
    if (!isApproveConfirmed) return;
    void refetchAllowance();
  }, [isApproveConfirmed, refetchAllowance]);

  useEffect(() => {
    if (isJoinConfirmed) {
      onClose();
    }
  }, [isJoinConfirmed, onClose]);

  if (!isOpen || !match) return null;

  const allowanceAmount = allowanceData ? BigInt(allowanceData as bigint) : 0n;
  const hasEnoughAllowance = allowanceAmount >= matchBuyIn;

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
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#0d1a3f]/80 px-4 py-8">
      <div className="flex min-h-full items-start justify-center">
        <div className="w-full max-w-lg border-4 border-[#4a261a] bg-[#20325f] shadow-[0_8px_0_0_#3a1d14]">
          <div className="flex items-center justify-between gap-4 border-b-4 border-[#4a261a] bg-[#6f3b1e] px-4 py-3 md:px-5">
            <div>
              <div className="font-mono text-2xl font-black uppercase text-[#ffd88a]">Join Match</div>
              <div className="font-mono text-xs font-bold uppercase text-[#fff2cf]">{match.id}</div>
            </div>
            <PixelButton variant="blue" className="px-3 py-1 text-sm" onClick={onClose}>
              Close
            </PixelButton>
          </div>

          <div className="space-y-4 p-4 md:p-5">
            <div className="border-4 border-[#26315f] bg-[#131d44] px-4 py-4 font-mono text-sm font-bold text-white shadow-[0_4px_0_0_#162141]">
              <div><span className="text-slate-300">Assets:</span> {match.assets}</div>
              <div className="mt-2"><span className="text-slate-300">Buy-in:</span> {compactNumber(formatUnits(matchBuyIn, buyInTokenDecimals))} {buyInTokenSymbol}</div>
              <div className="mt-2"><span className="text-slate-300">Duration:</span> {match.duration}</div>
              <div className="mt-2"><span className="text-slate-300">Status:</span> {match.status}</div>
            </div>

            <div className="border-4 border-[#26315f] bg-[#10173a] px-4 py-3 font-mono text-xs font-bold uppercase text-slate-200 shadow-[0_4px_0_0_#162141]">
              {!isConnected ? <div className="text-[#ff8f7f]">Connect a wallet to join this match.</div> : null}
              {match.statusCode !== 0 ? <div className="text-[#ff8f7f]">This match is no longer joinable.</div> : null}
              {isConnected && !hasEnoughAllowance ? (
                <div className="text-[#ff8f7f]">Approve {buyInTokenSymbol} before joining.</div>
              ) : null}
              {approveError ? <div className="mt-2 break-all text-[#ff8f7f]">{approveError.message}</div> : null}
              {joinError ? <div className="mt-2 break-all text-[#ff8f7f]">{joinError.message}</div> : null}
              {approveHash ? <div className="mt-2 break-all text-[#7fffb2]">Approve Tx: {approveHash}</div> : null}
              {joinHash ? <div className="mt-2 break-all text-[#7fffb2]">Join Tx: {joinHash}</div> : null}
              {isConfirmingApprove ? <div className="mt-2 text-[#ffefb0]">Waiting for approve confirmation...</div> : null}
              {isConfirmingJoin ? <div className="mt-2 text-[#ffefb0]">Waiting for join confirmation...</div> : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <PixelButton variant="blue" onClick={onClose}>
                Cancel
              </PixelButton>
              {!hasEnoughAllowance ? (
                <PixelButton variant="green" onClick={handleApprove} disabled={!canApprove}>
                  {isApprovePending
                    ? 'Confirm Approve In Wallet'
                    : isConfirmingApprove
                      ? 'Approving Token...'
                      : 'Approve Token'}
                </PixelButton>
              ) : null}
              <PixelButton variant="gold" onClick={handleJoin} disabled={!canJoin}>
                {isJoinPending ? 'Confirm In Wallet' : isConfirmingJoin ? 'Joining Match...' : 'Join Match'}
              </PixelButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
