import { type Address } from 'viem';
import { hyperliquidEvmChain, hyperliquidTestnetChain } from './networks';

export const preferredAssetOrder = ['BTC', 'ETH', 'SOL', 'MATIC'] as const;

export const assetDotColorByLabel: Record<string, string> = {
  BTC: 'bg-orange-500',
  ETH: 'bg-slate-300',
  SOL: 'bg-emerald-500',
};

export const preferredHyperDuelChainId = hyperliquidEvmChain.id;

export const hyperDuelContractByChainId: Partial<Record<number, Address>> = {
  [hyperliquidEvmChain.id]: '0x99a93684f569026d397f65eff0807f5347add051',
};

export const tokenIndexByChainId: Partial<Record<number, Record<string, number>>> = {
  [hyperliquidEvmChain.id]: {
    BTC: 142,
    ETH: 151,
    SOL: 156,
  },
  [hyperliquidTestnetChain.id]: {
    BTC: 1,
    ETH: 2,
    SOL: 3,
  },
};

export const zeroAddress = '0x0000000000000000000000000000000000000000';

export const swapHistoryLookbackBlocks = 50_000n;
