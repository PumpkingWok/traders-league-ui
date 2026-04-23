import { type Address } from 'viem';
import { hyperliquidEvmChain, hyperliquidTestnetChain } from './networks';
import vUsdLogo from '../assets/vusd.svg';

export const preferredAssetOrder = ['BTC', 'ETH', 'SOL', 'MATIC'] as const;

export const assetDotColorByLabel: Record<string, string> = {
  BTC: 'bg-orange-500',
  ETH: 'bg-slate-300',
  SOL: 'bg-emerald-500',
};

export const tokenAvatarUrlByLabel: Record<string, string> = {
  BTC: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  SOL: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
  HYPE: 'https://assets.coingecko.com/coins/images/50882/small/hyperliquid.jpg',
  USD: vUsdLogo,
  USDC: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
};

export const tokenSymbolByLabel: Record<string, string> = {
  USD: 'USD',
  BTC: 'BTC',
  ETH: 'ETH',
  SOL: 'SOL',
  HYPE: 'HYPE',
};

export const hyperDuelContractByChainId: Partial<Record<number, Address>> = {
  [hyperliquidEvmChain.id]: '0x99a93684f569026d397f65eff0807f5347add051',
  [hyperliquidTestnetChain.id]: '0xd26aD97bb86b58F2B12D2cc6E4f690B6cAB91F94',
};

export const tokenIndexByChainId: Partial<Record<number, Record<string, number>>> = {
  [hyperliquidEvmChain.id]: {
    BTC: 142,
    ETH: 151,
    SOL: 156,
  },
  [hyperliquidTestnetChain.id]: {
    HYPE: 1035,
    ETH: 1137,
  },
};

export const zeroAddress = '0x0000000000000000000000000000000000000000';
