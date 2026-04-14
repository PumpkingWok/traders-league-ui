import { type Address } from 'viem';

export type MatchCreationMode = 'empty' | 'creator-joins' | 'reserved';

export type Match = {
  id: string;
  matchId: bigint;
  buyInRaw: bigint;
  assets: string;
  buyIn: string;
  prize?: string;
  duration: string;
  countdown?: string;
  players: string;
  statusCode: number;
  status: string;
  winner: string;
  isJoined?: boolean;
  canConclude?: boolean;
  isConcluding?: boolean;
};

export type SwapHistoryEntry = {
  txHash: Address;
  blockNumber: bigint;
  timestamp: bigint | null;
  player: Address;
  tokenIn: number;
  tokenOut: number;
  amountIn: bigint;
  amountOut: bigint;
};
