import { formatUnits, type Address } from 'viem';
import { compactNumber, formatAddress } from '../utils/format';
import { zeroAddress } from '../config/contracts';

const platformFeeBase = 10_000n;

export function ResolveMatchModal({
  isOpen,
  matchId,
  playerA,
  playerB,
  predictedWinner,
  buyIn,
  buyInTokenSymbol,
  buyInTokenDecimals,
  platformFeeBps,
  onClose,
  onConfirm,
  isConfirming,
}: {
  isOpen: boolean;
  matchId: bigint;
  playerA: Address;
  playerB: Address;
  predictedWinner: Address;
  buyIn: bigint;
  buyInTokenSymbol: string;
  buyInTokenDecimals: number;
  platformFeeBps: bigint;
  onClose: () => void;
  onConfirm: () => void;
  isConfirming: boolean;
}) {
  if (!isOpen) return null;

  const isDraw = predictedWinner.toLowerCase() === zeroAddress;
  const grossPrize = buyIn * 2n;
  const feeAmount = isDraw ? 0n : (grossPrize * platformFeeBps) / platformFeeBase;
  const netPrize = grossPrize - feeAmount;
  const buyInLabel = `${compactNumber(formatUnits(buyIn, buyInTokenDecimals))} ${buyInTokenSymbol}`;
  const grossPrizeLabel = `${compactNumber(formatUnits(grossPrize, buyInTokenDecimals))} ${buyInTokenSymbol}`;
  const netPrizeLabel = `${compactNumber(formatUnits(netPrize, buyInTokenDecimals))} ${buyInTokenSymbol}`;
  const feeLabel = `${compactNumber(formatUnits(feeAmount, buyInTokenDecimals))} ${buyInTokenSymbol}`;
  const feePercentLabel = `${(Number(platformFeeBps) / 100).toFixed(2)}%`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/35 px-4 py-8">
      <div className="flex min-h-full items-start justify-center">
        <div className="w-full max-w-2xl border border-[#ababab] bg-[#f5f5f5] shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between gap-4 border-b border-[#bdbdbd] bg-[#ebebeb] px-4 py-3 md:px-5">
            <div>
              <div className="font-mono text-2xl font-black uppercase tracking-[0.08em] text-[#2f2f2f]">Resolve Match</div>
              <div className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#6a6a6a]">
                Match #{matchId.toString()}
              </div>
            </div>
            <button
              type="button"
              className="border border-[#b9b9b9] bg-[#f7f7f7] px-3 py-1 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#4f4f4f] hover:bg-[#ececec]"
              onClick={onClose}
              disabled={isConfirming}
            >
              Close
            </button>
          </div>

          <div className="space-y-4 p-4 md:p-5">
            <div className="border border-[#b9b9b9] bg-[#f9f9f9] px-4 py-3 font-mono text-sm font-bold text-[#424242]">
              <div>Player A: {formatAddress(playerA)}</div>
              <div className="mt-1">Player B: {formatAddress(playerB)}</div>
              <div className="mt-1">Buy-in (each): {buyInLabel}</div>
              <div className="mt-1">Total pot: {grossPrizeLabel}</div>
            </div>

            {isDraw ? (
              <div className="border border-[#b9b9b9] bg-[#f1f1f1] px-4 py-3">
                <div className="font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5e5e5e]">
                  Outcome Preview: Draw
                </div>
                <div className="mt-2 font-mono text-sm font-bold text-[#454545]">
                  Both players receive back their buy-in ({buyInLabel} each).
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-[#454545]">
                  Platform fee charged: 0 {buyInTokenSymbol}.
                </div>
              </div>
            ) : (
              <div className="border border-[#b9b9b9] bg-[#f1f1f1] px-4 py-3">
                <div className="font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5e5e5e]">
                  Outcome Preview: Winner
                </div>
                <div className="mt-2 font-mono text-sm font-bold text-[#454545]">
                  Winner address: {formatAddress(predictedWinner)}
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-[#454545]">
                  Winner receives net prize: {netPrizeLabel}.
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-[#454545]">
                  Platform fee: {feeLabel} ({feePercentLabel}).
                </div>
              </div>
            )}

            <div className="border border-[#b9b9b9] bg-[#f1f1f1] px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[#5e5e5e]">
              This preview is based on the current on-chain snapshot before confirmation.
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="border border-[#b9b9b9] bg-[#f7f7f7] px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#4f4f4f] hover:bg-[#ececec]"
                onClick={onClose}
                disabled={isConfirming}
              >
                Cancel
              </button>
              <button
                type="button"
                className="border border-[#8f83ff] bg-[#ece9ff] px-4 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#433d98] hover:bg-[#e3deff] disabled:cursor-not-allowed disabled:border-[#bdb8e6] disabled:bg-[#efedf8] disabled:text-[#7a77a2]"
                onClick={onConfirm}
                disabled={isConfirming}
              >
                {isConfirming ? 'Resolving...' : 'Confirm Resolve'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
