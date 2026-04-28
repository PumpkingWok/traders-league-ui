import { parseAbiItem } from 'viem';

export const hyperDuelAbi = [
  {
    type: 'function',
    name: 'createMatch',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'playerA', type: 'address' },
      { name: 'playerB', type: 'address' },
      { name: 'tokensAllowed', type: 'uint32[]' },
      { name: 'buyIn', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'joinMatch',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_matchId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'unjoinMatch',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_matchId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'concludeMatch',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_matchId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'swap',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_matchId', type: 'uint256' },
      { name: '_tokenIn', type: 'uint32' },
      { name: '_tokenOut', type: 'uint32' },
      { name: '_amountIn', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'swap',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_matchId', type: 'uint256' },
      { name: 'tokensIn', type: 'uint32[]' },
      { name: 'tokensOut', type: 'uint32[]' },
      { name: 'amountsIn', type: 'uint256[]' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'matchId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'buyInToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'platformFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'GAME_TRADER_FEE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'gameTraderFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'matches',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'playerA', type: 'address' },
      { name: 'playerB', type: 'address' },
      { name: 'winner', type: 'address' },
      { name: 'buyIn', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'status', type: 'uint8' },
    ],
  },
  {
    type: 'function',
    name: 'getMatchTokensAllowed',
    stateMutability: 'view',
    inputs: [{ name: '_matchId', type: 'uint256' }],
    outputs: [{ name: '_tokensAllowed', type: 'uint32[]' }],
  },
  {
    type: 'function',
    name: 'getPlayerTotalUsd',
    stateMutability: 'view',
    inputs: [
      { name: '_matchId', type: 'uint256' },
      { name: '_player', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'matchBalances',
    stateMutability: 'view',
    inputs: [
      { name: '', type: 'address' },
      { name: '', type: 'uint256' },
      { name: '', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tokenPx',
    stateMutability: 'view',
    inputs: [{ name: 'index', type: 'uint32' }],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'tradingTokens',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint32' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

export const erc20MetadataAbi = [
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const erc20AllowanceAbi = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const hyperDuelSwapEvent = parseAbiItem(
  'event Swap(uint32 indexed tokenIn, uint32 indexed tokenOut, uint256 amountIn, uint256 amountOut, address player, uint256 matchId)',
);
