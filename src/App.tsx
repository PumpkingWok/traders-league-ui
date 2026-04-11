import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatUnits, parseUnits, type Address } from 'viem';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { hasWalletConnectProjectId, hyperliquidEvmChain, hyperliquidTestnetChain, supportedChains } from './wallet';
import './ui.css';

const stats = [
  { label: 'Open Matches', value: '12', icon: '📦' },
  { label: 'Live Matches', value: '6', icon: '⚔️' },
  { label: 'Completed Matches', value: '134', icon: '🏆' },
  { label: 'Supported Chains', value: String(supportedChains.length), icon: '🌐' },
];

const preferredAssetOrder = ['BTC', 'ETH', 'SOL', 'MATIC'] as const;
const assetDotColorByLabel: Record<string, string> = {
  BTC: 'bg-orange-500',
  ETH: 'bg-slate-300',
  SOL: 'bg-emerald-500',
};

const preferredHyperDuelChainId = hyperliquidEvmChain.id;

const hyperDuelContractByChainId: Partial<Record<number, Address>> = {
  [hyperliquidEvmChain.id]: '0x99a93684f569026d397f65eff0807f5347add051',
};

const tokenIndexByChainId: Partial<Record<number, Record<string, number>>> = {
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

const hyperDuelAbi = [
  {
    type: 'function',
    name: 'createMatch',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokensAllowed', type: 'uint32[]' },
      { name: 'buyIn', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'createMatchAndJoin',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokensAllowed', type: 'uint32[]' },
      { name: 'buyIn', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'askForMatch',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'playerToAsk', type: 'address' },
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
    name: 'spotPx',
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

const erc20MetadataAbi = [
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

const erc20AllowanceAbi = [
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

const zeroAddress = '0x0000000000000000000000000000000000000000';

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

const navbarControlClassName = 'h-[52px]';

const howToPlaySteps = [
  {
    title: 'Create Or Join A Match',
    description:
      'Start a new 1v1 battle or join an open one from the lobby. Every match is built around a fixed setup chosen before the game begins.',
  },
  {
    title: 'Choose Assets, Buy-In And Duration',
    description:
      'Each match has an allowed token list to trade from, plus a buy-in in USDC and a duration. Both players compete under the same exact rules.',
  },
  {
    title: 'Trade With Virtual Funds',
    description:
      'When the match starts, each player receives 100K virtual USD. During the timer, players can virtually swap among the allowed assets to grow portfolio value.',
  },
  {
    title: 'Finish Above Your Opponent',
    description:
      'At the end of the match, the player whose portfolio is worth more virtual USD wins the match and takes the prize pool.',
  },
];

type Match = {
  id: string;
  matchId: bigint;
  buyInRaw: bigint;
  assets: string;
  buyIn: string;
  duration: string;
  players: string;
  statusCode: number;
  status: string;
  winner: string;
};

export default function App() {
  const navigate = useNavigate();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [hasAttemptedAutoSwitch, setHasAttemptedAutoSwitch] = useState(false);
  const [isCreateMatchModalOpen, setIsCreateMatchModalOpen] = useState(false);
  const [selectedBuyIn, setSelectedBuyIn] = useState(25);
  const [selectedDurationHours, setSelectedDurationHours] = useState(4);
  const [selectedAssets, setSelectedAssets] = useState<string[]>(['BTC', 'ETH']);
  const [matchCreationMode, setMatchCreationMode] = useState<'empty' | 'creator-joins' | 'reserved'>('creator-joins');
  const [reservedOpponentAddress, setReservedOpponentAddress] = useState('');
  const selectedDuration = formatDuration(selectedDurationHours);
  const hyperDuelContractAddress = hyperDuelContractByChainId[chainId];
  const tokenIndexMap = tokenIndexByChainId[chainId] ?? {};
  const availableAssets = useMemo(() => {
    const labels = Object.keys(tokenIndexMap);
    const ordered = [
      ...preferredAssetOrder.filter((label) => labels.includes(label)),
      ...labels.filter((label) => !preferredAssetOrder.includes(label as (typeof preferredAssetOrder)[number])).sort(),
    ];

    return ordered.map((label) => ({
      label,
      color: assetDotColorByLabel[label] ?? 'bg-blue-400',
      index: tokenIndexMap[label],
    }));
  }, [tokenIndexMap]);

  useEffect(() => {
    setSelectedAssets((currentAssets) => {
      const supportedAssetLabels = new Set(availableAssets.map((asset) => asset.label));
      const filtered = currentAssets.filter((asset) => supportedAssetLabels.has(asset));
      if (filtered.length > 0) return filtered;
      if (availableAssets.length === 0) return [];
      return availableAssets.slice(0, Math.min(2, availableAssets.length)).map((asset) => asset.label);
    });
  }, [availableAssets]);

  const toggleAsset = (assetLabel: string) => {
    setSelectedAssets((currentAssets) => {
      if (currentAssets.includes(assetLabel)) {
        if (currentAssets.length === 1) return currentAssets;
        return currentAssets.filter((asset) => asset !== assetLabel);
      }

      return [...currentAssets, assetLabel];
    });
  };

  const openCreateMatchFromHome = () => {
    setIsCreateMatchModalOpen(true);
    navigate('/matches');
  };

  useEffect(() => {
    if (!isConnected) {
      setHasAttemptedAutoSwitch(false);
      return;
    }

    if (hasAttemptedAutoSwitch || chainId === preferredHyperDuelChainId) {
      return;
    }

    setHasAttemptedAutoSwitch(true);
    void switchChainAsync({ chainId: preferredHyperDuelChainId }).catch(() => undefined);
  }, [chainId, hasAttemptedAutoSwitch, isConnected, switchChainAsync]);

  const { data: appBuyInTokenAddress } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'buyInToken',
    query: {
      enabled: Boolean(hyperDuelContractAddress),
    },
  });

  const { data: appBuyInTokenData } = useReadContracts({
    contracts:
      appBuyInTokenAddress && address
        ? [
            {
              address: appBuyInTokenAddress as Address,
              abi: erc20MetadataAbi,
              functionName: 'symbol',
            },
            {
              address: appBuyInTokenAddress as Address,
              abi: erc20MetadataAbi,
              functionName: 'decimals',
            },
            {
              address: appBuyInTokenAddress as Address,
              abi: erc20MetadataAbi,
              functionName: 'balanceOf',
              args: [address as Address],
            },
          ]
        : [],
    query: {
      enabled: Boolean(appBuyInTokenAddress && address),
    },
  });

  const appBuyInTokenSymbol = (appBuyInTokenData?.[0]?.result as string | undefined) ?? 'TOKEN';
  const appBuyInTokenDecimals = Number((appBuyInTokenData?.[1]?.result as number | undefined) ?? 18);
  const appBuyInTokenBalance = (appBuyInTokenData?.[2]?.result as bigint | undefined) ?? 0n;
  const buyInBalanceLabel =
    isConnected && address && appBuyInTokenAddress
      ? `${compactNumber(formatUnits(appBuyInTokenBalance, appBuyInTokenDecimals))} ${appBuyInTokenSymbol}`
      : null;

  return (
    <div className="min-h-screen bg-[#1b2a7a] text-white overflow-x-hidden">
      <PixelBackground />

      <div className="relative z-10">
        <Navbar buyInBalanceLabel={buyInBalanceLabel} />

        <main className="mx-auto max-w-7xl px-4 pb-12 pt-6 md:px-6 lg:px-8">
          <Routes>
            <Route
              path="/"
              element={
                <HomePage
                  onOpenCreateMatch={openCreateMatchFromHome}
                  onBrowseMatches={() => navigate('/matches')}
                />
              }
            />
            <Route
              path="/matches"
              element={
                <MatchesPage
                  onOpenCreateMatch={() => setIsCreateMatchModalOpen(true)}
                />
              }
            />
            <Route path="/my-matches" element={<MyMatchesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <CreateMatchModal
        isOpen={isCreateMatchModalOpen}
        availableAssets={availableAssets}
        buyInBalanceLabel={buyInBalanceLabel}
        selectedBuyIn={selectedBuyIn}
        selectedDuration={selectedDuration}
        selectedAssets={selectedAssets}
        matchCreationMode={matchCreationMode}
        reservedOpponentAddress={reservedOpponentAddress}
        onAssetsChange={toggleAsset}
        onBuyInChange={setSelectedBuyIn}
        selectedDurationHours={selectedDurationHours}
        onDurationChange={setSelectedDurationHours}
        onMatchCreationModeChange={setMatchCreationMode}
        onReservedOpponentAddressChange={setReservedOpponentAddress}
        onClose={() => setIsCreateMatchModalOpen(false)}
      />
    </div>
  );
}

function HomePage({
  onOpenCreateMatch,
  onBrowseMatches,
}: {
  onOpenCreateMatch: () => void;
  onBrowseMatches: () => void;
}) {
  return (
    <>
      <section className="grid grid-cols-1 gap-6 border-y-4 border-[#0f1645] bg-[#3f8cff]/20 px-4 py-8 shadow-[0_6px_0_0_#0f1645] md:grid-cols-[1.15fr_1fr] md:px-8">
        <div className="space-y-5">
          <div>
            <h1 className="font-mono text-3xl font-black uppercase tracking-tight text-white md:text-5xl">
              Compete in 1v1 Trading Battles!
            </h1>
            <ul className="mt-5 space-y-2 font-mono text-base font-bold md:text-lg">
              <li>• Create a match</li>
              <li>• Set buy-in and duration</li>
              <li>• Trade virtual assets</li>
              <li>• Win the pot!</li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-3">
            <PixelButton variant="gold" onClick={onOpenCreateMatch}>
              Create Match
            </PixelButton>
            <PixelButton variant="blue" onClick={onBrowseMatches}>
              Browse Matches
            </PixelButton>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {stats.map((stat) => (
            <PixelStatCard key={stat.label} icon={stat.icon} label={stat.label} value={stat.value} />
          ))}
        </div>
      </section>

      <section id="how-to-play" className="mt-6">
        <PixelPanel title="How to Play">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {howToPlaySteps.map((step, index) => (
                <div
                  key={step.title}
                  className="border-4 border-[#26315f] bg-[#131d44] px-4 py-4 shadow-[0_4px_0_0_#162141]"
                >
                  <div className="font-mono text-xs font-black uppercase text-[#ffbf3f]">
                    Step {index + 1}
                  </div>
                  <h3 className="mt-2 font-mono text-xl font-black uppercase text-white">
                    {step.title}
                  </h3>
                  <p className="mt-3 font-mono text-sm font-bold leading-6 text-slate-200">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-4 border-[#4a261a] bg-[#6f3b1e] px-4 py-4 shadow-[0_5px_0_0_#3a1d14]">
              <div className="font-mono text-sm font-black uppercase text-[#ffefb0]">
                Win Condition
              </div>
              <p className="mt-2 font-mono text-sm font-bold leading-6 text-[#fff2cf]">
                Both players begin with 100K virtual USD. When the timer ends, the player with the
                highest portfolio value in virtual USD wins the match prize.
              </p>
            </div>
          </div>
        </PixelPanel>
      </section>
    </>
  );
}

function MatchesPage({
  onOpenCreateMatch,
}: {
  onOpenCreateMatch: () => void;
}) {
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const hyperDuelContractAddress = hyperDuelContractByChainId[chainId];
  const tokenIndexMap = tokenIndexByChainId[chainId] ?? {};
  const [contractMatches, setContractMatches] = useState<
    Array<{
      id: bigint;
      playerA: Address;
      playerB: Address;
      winner: Address;
      buyIn: bigint;
      duration: bigint;
      status: number;
      tokensAllowed: number[];
    }>
  >([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [selectedMatchToJoin, setSelectedMatchToJoin] = useState<Match | null>(null);
  const [matchFilter, setMatchFilter] = useState<'to-start' | 'current' | 'finish' | 'all'>('current');
  const [sortBy, setSortBy] = useState<'duration' | 'buyIn'>('duration');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const { data: latestMatchIdData } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'matchId',
    query: {
      enabled: Boolean(hyperDuelContractAddress),
    },
  });

  const { data: buyInTokenAddressData } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'buyInToken',
    query: {
      enabled: Boolean(hyperDuelContractAddress),
    },
  });

  const { data: buyInTokenMetadata } = useReadContracts({
    contracts: buyInTokenAddressData
      ? [
          {
            address: buyInTokenAddressData as Address,
            abi: erc20MetadataAbi,
            functionName: 'symbol',
          },
          {
            address: buyInTokenAddressData as Address,
            abi: erc20MetadataAbi,
            functionName: 'decimals',
          },
        ]
      : [],
    query: {
      enabled: Boolean(buyInTokenAddressData),
    },
  });

  const buyInTokenSymbol = (buyInTokenMetadata?.[0]?.result as string | undefined) ?? 'TOKEN';
  const buyInTokenDecimals = Number((buyInTokenMetadata?.[1]?.result as number | undefined) ?? 18);

  useEffect(() => {
    if (!publicClient || !hyperDuelContractAddress || latestMatchIdData === undefined) {
      return;
    }

    const latestMatchId = Number(latestMatchIdData);
    if (!Number.isFinite(latestMatchId) || latestMatchId < 1) {
      setContractMatches([]);
      return;
    }

    let cancelled = false;
    const fetchMatches = async () => {
      setIsLoadingMatches(true);
      setMatchesError(null);

      try {
        const matchIds = Array.from({ length: latestMatchId }, (_, index) => BigInt(index + 1));
        const recordsResult = await Promise.allSettled(
          matchIds.map(async (id) => {
            const match = (await publicClient.readContract({
              address: hyperDuelContractAddress,
              abi: hyperDuelAbi,
              functionName: 'matches',
              args: [id],
            })) as readonly [Address, Address, Address, bigint, bigint, bigint, number];

            const tokensAllowed = (await publicClient.readContract({
              address: hyperDuelContractAddress,
              abi: hyperDuelAbi,
              functionName: 'getMatchTokensAllowed',
              args: [id],
            })) as readonly number[] | readonly bigint[];

            return {
              id,
              playerA: match[0],
              playerB: match[1],
              winner: match[2],
              buyIn: match[3],
              duration: match[4],
              status: Number(match[6]),
              tokensAllowed: tokensAllowed.map((tokenId) => Number(tokenId)),
            };
          }),
        );

        if (!cancelled) {
          const records = recordsResult
            .filter((result): result is PromiseFulfilledResult<(typeof contractMatches)[number]> => result.status === 'fulfilled')
            .map((result) => result.value);
          setContractMatches(records);

          const failedReads = recordsResult.length - records.length;
          if (failedReads > 0) {
            setMatchesError(`Some matches could not be loaded (${failedReads} failed read${failedReads === 1 ? '' : 's'}).`);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setContractMatches([]);
          setMatchesError(error instanceof Error ? error.message : 'Could not fetch matches.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMatches(false);
        }
      }
    };

    void fetchMatches();
    return () => {
      cancelled = true;
    };
  }, [hyperDuelContractAddress, latestMatchIdData, publicClient]);

  const displayMatches = useMemo(() => {
    const tokenLabelById = Object.entries(tokenIndexMap).reduce<Record<number, string>>((accumulator, [label, id]) => {
      accumulator[id] = label;
      return accumulator;
    }, {});

    const filtered = contractMatches.filter((match) => {
      if (match.status === 3) return false;
      if (matchFilter === 'to-start') return match.status === 0;
      if (matchFilter === 'current') return match.status === 1;
      if (matchFilter === 'finish') return match.status === 2;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const comparePrimary =
        sortBy === 'duration'
          ? a.duration === b.duration
            ? 0
            : a.duration > b.duration
              ? 1
              : -1
          : a.buyIn === b.buyIn
            ? 0
            : a.buyIn > b.buyIn
              ? 1
              : -1;

      const orderedCompare = sortDirection === 'asc' ? comparePrimary : -comparePrimary;
      if (orderedCompare !== 0) return orderedCompare;
      return Number(b.id - a.id);
    });

    return sorted.map((match) => {
      const playersCount = Number(match.playerA.toLowerCase() !== zeroAddress) + Number(match.playerB.toLowerCase() !== zeroAddress);
      const statusLabel = match.status === 0 ? 'To Start' : match.status === 1 ? 'Ongoing' : 'Finished';
      const assetsLabel =
        match.tokensAllowed.length > 0
          ? match.tokensAllowed.map((tokenId) => tokenLabelById[tokenId] ?? `T${tokenId}`).join(' • ')
          : 'No assets';
      const winnerAddress = match.winner.toLowerCase();
      const winnerLabel =
        match.status === 2
          ? winnerAddress === zeroAddress
            ? 'Tie'
            : formatAddress(match.winner)
          : match.status === 1
            ? winnerAddress === zeroAddress
              ? 'Undecided'
              : formatAddress(match.winner)
            : '-';

      return {
        id: `#${match.id.toString()}`,
        matchId: match.id,
        buyInRaw: match.buyIn,
        assets: assetsLabel,
        buyIn: `${compactNumber(formatUnits(match.buyIn, buyInTokenDecimals))} ${buyInTokenSymbol}`,
        duration: formatDurationFromSeconds(match.duration),
        players: `${playersCount}/2`,
        statusCode: match.status,
        status: statusLabel,
        winner: winnerLabel,
      };
    });
  }, [buyInTokenDecimals, buyInTokenSymbol, contractMatches, matchFilter, sortBy, sortDirection, tokenIndexMap]);

  return (
    <section className="space-y-6">
      <section className="border-y-4 border-[#0f1645] bg-[#3f8cff]/20 px-4 py-8 shadow-[0_6px_0_0_#0f1645] md:px-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="font-mono text-sm font-black uppercase tracking-[0.2em] text-[#ffbf3f]">
              Match Lobby
            </div>
            <h1 className="font-mono text-3xl font-black uppercase tracking-tight text-white md:text-5xl">
              Create Or Join A 1v1 Match
            </h1>
            <p className="font-mono text-sm font-bold leading-6 text-slate-100 md:text-base">
              Configure the allowed assets, lock the buy-in, and jump into the live lobby to find
              your next trading battle.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <PixelButton variant="gold" onClick={onOpenCreateMatch}>
              Create Match
            </PixelButton>
          </div>
        </div>
      </section>

      <section>
        <PixelPanel title="Open 1v1 Matches">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                <PixelSelectButton active={sortBy === 'duration'} onClick={() => setSortBy('duration')}>
                  Sort: Duration
                </PixelSelectButton>
                <PixelSelectButton active={sortBy === 'buyIn'} onClick={() => setSortBy('buyIn')}>
                  Sort: Buy-In
                </PixelSelectButton>
                <PixelSelectButton active={sortDirection === 'asc'} onClick={() => setSortDirection('asc')}>
                  Asc
                </PixelSelectButton>
                <PixelSelectButton active={sortDirection === 'desc'} onClick={() => setSortDirection('desc')}>
                  Desc
                </PixelSelectButton>
              </div>

              <div className="flex items-center gap-2 self-start lg:self-auto">
                <PixelTab active={matchFilter === 'to-start'} onClick={() => setMatchFilter('to-start')}>
                  TOSTART
                </PixelTab>
                <PixelTab active={matchFilter === 'current'} onClick={() => setMatchFilter('current')}>
                  CURRENT
                </PixelTab>
                <PixelTab active={matchFilter === 'finish'} onClick={() => setMatchFilter('finish')}>
                  FINISH
                </PixelTab>
                <PixelTab active={matchFilter === 'all'} onClick={() => setMatchFilter('all')}>
                  ALL
                </PixelTab>
              </div>
            </div>

            <div className="overflow-hidden border-4 border-[#1b2346] bg-[#14204a] shadow-[0_5px_0_0_#0b1029]">
              {matchesError && displayMatches.length > 0 ? (
                <div className="border-b-4 border-[#4a261a] bg-[#6f3b1e] px-4 py-3 font-mono text-xs font-black uppercase text-[#fff2cf]">
                  {matchesError}
                </div>
              ) : null}
              <div className="hidden grid-cols-[120px_1.2fr_140px_140px_100px_120px_160px_110px] gap-4 border-b-4 border-[#26315f] bg-[#1d2b5f] px-4 py-3 font-mono text-xs font-black uppercase text-slate-200 md:grid">
                <div>Match ID</div>
                <div>Assets</div>
                <div>Buy-In</div>
                <div>Duration</div>
                <div>Players</div>
                <div>Status</div>
                <div>Winner</div>
                <div>Action</div>
              </div>

              <div className="divide-y-4 divide-[#26315f]">
                {isLoadingMatches ? (
                  <div className="px-4 py-6 font-mono text-sm font-black uppercase text-slate-200">
                    Loading matches from contract...
                  </div>
                ) : !hyperDuelContractAddress ? (
                  <div className="px-4 py-6 font-mono text-sm font-black uppercase text-[#ff8f7f]">
                    No HyperDuel contract configured for this network.
                  </div>
                ) : displayMatches.length === 0 ? (
                  matchesError ? (
                    <div className="px-4 py-6 font-mono text-sm font-black uppercase text-[#ff8f7f]">
                      Failed to load matches
                    </div>
                  ) : (
                    <div className="px-4 py-6 font-mono text-sm font-black uppercase text-slate-300">
                      No matches for this filter
                    </div>
                  )
                ) : (
                  displayMatches.map((match) => (
                    <MatchRow key={match.id} match={match} onJoin={() => setSelectedMatchToJoin(match)} />
                  ))
                )}
              </div>
            </div>
          </div>
        </PixelPanel>
      </section>

      <JoinMatchModal
        isOpen={Boolean(selectedMatchToJoin)}
        match={selectedMatchToJoin}
        buyInTokenAddress={buyInTokenAddressData as Address | undefined}
        buyInTokenSymbol={buyInTokenSymbol}
        buyInTokenDecimals={buyInTokenDecimals}
        hyperDuelContractAddress={hyperDuelContractAddress}
        onClose={() => setSelectedMatchToJoin(null)}
      />
    </section>
  );
}

function MyMatchesPage() {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const hyperDuelContractAddress = hyperDuelContractByChainId[chainId];
  const tokenIndexMap = tokenIndexByChainId[chainId] ?? {};
  const tokenLabelById = useMemo(
    () =>
      Object.entries(tokenIndexMap).reduce<Record<number, string>>((accumulator, [label, id]) => {
        accumulator[id] = label;
        return accumulator;
      }, {}),
    [tokenIndexMap],
  );

  const [matches, setMatches] = useState<
    Array<{
      id: bigint;
      playerA: Address;
      playerB: Address;
      buyIn: bigint;
      duration: bigint;
      status: number;
      tokensAllowed: number[];
    }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'to-start' | 'ongoing' | 'finished' | 'all'>('all');

  const { data: latestMatchIdData } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'matchId',
    query: {
      enabled: Boolean(hyperDuelContractAddress && isConnected && address),
    },
  });

  const { data: buyInTokenAddressData } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'buyInToken',
    query: {
      enabled: Boolean(hyperDuelContractAddress),
    },
  });

  const { data: buyInTokenMetadata } = useReadContracts({
    contracts: buyInTokenAddressData
      ? [
          {
            address: buyInTokenAddressData as Address,
            abi: erc20MetadataAbi,
            functionName: 'symbol',
          },
          {
            address: buyInTokenAddressData as Address,
            abi: erc20MetadataAbi,
            functionName: 'decimals',
          },
        ]
      : [],
    query: {
      enabled: Boolean(buyInTokenAddressData),
    },
  });

  const buyInTokenSymbol = (buyInTokenMetadata?.[0]?.result as string | undefined) ?? 'TOKEN';
  const buyInTokenDecimals = Number((buyInTokenMetadata?.[1]?.result as number | undefined) ?? 18);

  useEffect(() => {
    if (!isConnected || !address) {
      setMatches([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    if (!publicClient || !hyperDuelContractAddress || latestMatchIdData === undefined) {
      return;
    }

    const latestMatchId = Number(latestMatchIdData);
    if (!Number.isFinite(latestMatchId) || latestMatchId < 1) {
      setMatches([]);
      return;
    }

    let cancelled = false;
    const account = address.toLowerCase();

    const fetchMyMatches = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const matchIds = Array.from({ length: latestMatchId }, (_, index) => BigInt(index + 1));
        const recordsResult = await Promise.allSettled(
          matchIds.map(async (id) => {
            const match = (await publicClient.readContract({
              address: hyperDuelContractAddress,
              abi: hyperDuelAbi,
              functionName: 'matches',
              args: [id],
            })) as readonly [Address, Address, Address, bigint, bigint, bigint, number];

            const playerA = match[0];
            const playerB = match[1];
            if (playerA.toLowerCase() !== account && playerB.toLowerCase() !== account) {
              return null;
            }

            const tokensAllowed = (await publicClient.readContract({
              address: hyperDuelContractAddress,
              abi: hyperDuelAbi,
              functionName: 'getMatchTokensAllowed',
              args: [id],
            })) as readonly number[] | readonly bigint[];

            return {
              id,
              playerA,
              playerB,
              buyIn: match[3],
              duration: match[4],
              status: Number(match[6]),
              tokensAllowed: tokensAllowed.map((tokenId) => Number(tokenId)),
            };
          }),
        );

        if (!cancelled) {
          const hydrated = recordsResult
            .filter((result): result is PromiseFulfilledResult<(typeof matches)[number] | null> => result.status === 'fulfilled')
            .map((result) => result.value)
            .filter((value): value is (typeof matches)[number] => value !== null);
          setMatches(hydrated);

          const failedReads = recordsResult.filter((result) => result.status === 'rejected').length;
          if (failedReads > 0) {
            setError(`Some matches could not be loaded (${failedReads} failed read${failedReads === 1 ? '' : 's'}).`);
          }
        }
      } catch (fetchError) {
        if (!cancelled) {
          setMatches([]);
          setError(fetchError instanceof Error ? fetchError.message : 'Could not load your matches.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void fetchMyMatches();
    return () => {
      cancelled = true;
    };
  }, [address, hyperDuelContractAddress, isConnected, latestMatchIdData, publicClient]);

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      if (statusFilter === 'to-start') return match.status === 0;
      if (statusFilter === 'ongoing') return match.status === 1;
      if (statusFilter === 'finished') return match.status === 2;
      return match.status !== 3;
    });
  }, [matches, statusFilter]);

  if (!isConnected || !address) {
    return (
      <section className="space-y-6">
        <PixelPanel title="My Matches">
          <div className="font-mono text-sm font-black uppercase text-[#ff8f7f]">
            Connect your wallet to see matches you joined.
          </div>
        </PixelPanel>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <section className="border-y-4 border-[#0f1645] bg-[#3f8cff]/20 px-4 py-8 shadow-[0_6px_0_0_#0f1645] md:px-8">
        <div className="max-w-3xl space-y-3">
          <div className="font-mono text-sm font-black uppercase tracking-[0.2em] text-[#ffbf3f]">My Matches</div>
          <h1 className="font-mono text-3xl font-black uppercase tracking-tight text-white md:text-5xl">
            Track And Manage Your Matches
          </h1>
          <p className="font-mono text-sm font-bold leading-6 text-slate-100 md:text-base">
            Review all matches where you are subscribed and manage live swaps during ongoing battles.
          </p>
        </div>
      </section>

      <PixelPanel title="My Match List">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <PixelTab active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
              All
            </PixelTab>
            <PixelTab active={statusFilter === 'to-start'} onClick={() => setStatusFilter('to-start')}>
              To Start
            </PixelTab>
            <PixelTab active={statusFilter === 'ongoing'} onClick={() => setStatusFilter('ongoing')}>
              Ongoing
            </PixelTab>
            <PixelTab active={statusFilter === 'finished'} onClick={() => setStatusFilter('finished')}>
              Finished
            </PixelTab>
          </div>

          {error ? (
            <div className="border-4 border-[#4a261a] bg-[#6f3b1e] px-4 py-3 font-mono text-xs font-black uppercase text-[#fff2cf]">
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <div className="font-mono text-sm font-black uppercase text-slate-200">Loading your matches...</div>
          ) : filteredMatches.length === 0 ? (
            <div className="font-mono text-sm font-black uppercase text-slate-300">No matches in this category.</div>
          ) : (
            <div className="space-y-4">
              {filteredMatches.map((match) => {
                const statusLabel = match.status === 0 ? 'To Start' : match.status === 1 ? 'Ongoing' : 'Finished';
                const assetsLabel =
                  match.tokensAllowed.length > 0
                    ? match.tokensAllowed.map((tokenId) => tokenLabelById[tokenId] ?? `T${tokenId}`).join(' • ')
                    : 'No assets';

                return (
                  <div key={match.id.toString()} className="border-4 border-[#26315f] bg-[#131d44] px-4 py-4 shadow-[0_4px_0_0_#162141]">
                    <div className="grid gap-3 font-mono text-sm font-bold text-white md:grid-cols-2">
                      <div><span className="text-slate-300">Match:</span> #{match.id.toString()}</div>
                      <div><span className="text-slate-300">Status:</span> {statusLabel}</div>
                      <div className="md:col-span-2"><span className="text-slate-300">Assets:</span> {assetsLabel}</div>
                      <div>
                        <span className="text-slate-300">Buy-in:</span>{' '}
                        {compactNumber(formatUnits(match.buyIn, buyInTokenDecimals))} {buyInTokenSymbol}
                      </div>
                      <div><span className="text-slate-300">Duration:</span> {formatDurationFromSeconds(match.duration)}</div>
                    </div>

                    {match.status === 1 ? (
                      <div className="mt-4 border-t-4 border-[#26315f] pt-4">
                        <div className="mb-3 font-mono text-xs font-black uppercase text-[#ffefb0]">Swap (Ongoing Match)</div>
                        <SwapPanel
                          matchId={match.id}
                          tokensAllowed={match.tokensAllowed}
                          tokenLabelById={tokenLabelById}
                          hyperDuelContractAddress={hyperDuelContractAddress}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PixelPanel>
    </section>
  );
}

function SwapPanel({
  matchId,
  tokensAllowed,
  tokenLabelById,
  hyperDuelContractAddress,
}: {
  matchId: bigint;
  tokensAllowed: number[];
  tokenLabelById: Record<number, string>;
  hyperDuelContractAddress?: Address;
}) {
  const { isConnected } = useAccount();
  const selectableTokens = useMemo(() => [0, ...tokensAllowed], [tokensAllowed]);
  const [tokenIn, setTokenIn] = useState<number>(selectableTokens[0] ?? 0);
  const [tokenOut, setTokenOut] = useState<number>(selectableTokens[1] ?? selectableTokens[0] ?? 0);
  const [amountIn, setAmountIn] = useState('');

  const {
    data: swapHash,
    error: swapError,
    isPending: isSwapPending,
    writeContract: writeSwap,
  } = useWriteContract();
  const { isLoading: isConfirmingSwap } = useWaitForTransactionReceipt({
    hash: swapHash,
  });

  const { data: tokenDecimalsData } = useReadContracts({
    contracts:
      hyperDuelContractAddress && tokensAllowed.length > 0
        ? tokensAllowed.map((tokenId) => ({
            address: hyperDuelContractAddress,
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
      map[tokenId] = typeof result === 'number' ? result : 8;
    });
    return map;
  }, [tokenDecimalsData, tokensAllowed]);

  useEffect(() => {
    if (!selectableTokens.includes(tokenIn)) {
      setTokenIn(selectableTokens[0] ?? 0);
    }
    if (!selectableTokens.includes(tokenOut)) {
      setTokenOut(selectableTokens[1] ?? selectableTokens[0] ?? 0);
    }
  }, [selectableTokens, tokenIn, tokenOut]);

  const parsedAmountIn = useMemo(() => {
    if (!amountIn) return null;
    try {
      return parseUnits(amountIn, tokenDecimalsById[tokenIn] ?? 8);
    } catch {
      return null;
    }
  }, [amountIn, tokenDecimalsById, tokenIn]);

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

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <select
          className="border-4 border-[#26315f] bg-[#10173a] px-3 py-2 font-mono text-sm font-bold text-white"
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
          className="border-4 border-[#26315f] bg-[#10173a] px-3 py-2 font-mono text-sm font-bold text-white"
          value={tokenOut}
          onChange={(event) => setTokenOut(Number(event.target.value))}
        >
          {selectableTokens.map((tokenId) => (
            <option key={`out-${tokenId}`} value={tokenId}>
              {tokenId === 0 ? 'USD (Virtual)' : tokenLabelById[tokenId] ?? `T${tokenId}`}
            </option>
          ))}
        </select>

        <PixelInput
          type="text"
          placeholder="Amount in"
          value={amountIn}
          onChange={setAmountIn}
        />
      </div>

      {tokenIn === tokenOut ? (
        <div className="font-mono text-xs font-bold uppercase text-[#ff8f7f]">Select different tokens.</div>
      ) : null}
      {amountIn && parsedAmountIn === null ? (
        <div className="font-mono text-xs font-bold uppercase text-[#ff8f7f]">Enter a valid amount.</div>
      ) : null}
      {swapError ? <div className="break-all font-mono text-xs font-bold uppercase text-[#ff8f7f]">{swapError.message}</div> : null}
      {swapHash ? <div className="break-all font-mono text-xs font-bold uppercase text-[#7fffb2]">Swap Tx: {swapHash}</div> : null}

      <div className="flex justify-end">
        <PixelButton variant="gold" onClick={onSwap} disabled={!canSwap}>
          {isSwapPending ? 'Confirm In Wallet' : isConfirmingSwap ? 'Swapping...' : 'Swap'}
        </PixelButton>
      </div>
    </div>
  );
}

function Navbar({ buyInBalanceLabel }: { buyInBalanceLabel: string | null }) {
  return (
    <header className="sticky top-0 z-20 border-b-4 border-[#0f1645] bg-[#2053d6] shadow-[0_4px_0_0_#0f1645]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center border-4 border-[#0f1645] bg-[#ff9c1a] text-2xl shadow-[0_4px_0_0_#0f1645]">
            🛡️
          </div>
          <div>
            <div className="font-mono text-2xl font-black uppercase tracking-tight text-[#ffbf3f] md:text-3xl">
              Traders League
            </div>
            <div className="font-mono text-[11px] font-bold uppercase text-blue-100">Multi-chain trading arena</div>
          </div>
        </div>

        <nav className="hidden items-center gap-8 font-mono text-lg font-black uppercase text-white md:flex">
          <NavLink
            to="/"
            className={({ isActive }) =>
              isActive ? 'border-b-4 border-[#ffbf3f] pb-1 text-[#ffefb0]' : 'hover:text-[#ffefb0]'
            }
          >
            Home
          </NavLink>
          <NavLink
            to="/matches"
            className={({ isActive }) =>
              isActive ? 'border-b-4 border-[#ffbf3f] pb-1 text-[#ffefb0]' : 'hover:text-[#ffefb0]'
            }
          >
            Matches
          </NavLink>
          <NavLink
            to="/my-matches"
            className={({ isActive }) =>
              isActive ? 'border-b-4 border-[#ffbf3f] pb-1 text-[#ffefb0]' : 'hover:text-[#ffefb0]'
            }
          >
            My Matches
          </NavLink>
        </nav>

        <div className="flex items-center gap-3">
          {buyInBalanceLabel ? (
            <div className={`hidden items-center border-4 border-[#0b2f7b] bg-[#1c63ff] px-4 py-2 font-mono text-lg font-black uppercase text-[#ffefb0] shadow-[0_4px_0_0_#0b2f7b] md:inline-flex ${navbarControlClassName}`}>
              Balance: {buyInBalanceLabel}
            </div>
          ) : null}
          <div className="hidden md:block">
            <NetworkSelector />
          </div>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

function NetworkSelector() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const activeChainName =
    supportedChains.find((chain) => chain.id === chainId)?.name ?? hyperliquidTestnetChain.name;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!dropdownRef.current) return;
      const target = event.target as Node | null;
      if (target && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <PixelButton variant="blue" className={navbarControlClassName} onClick={() => setIsOpen((value) => !value)}>
        {activeChainName}
      </PixelButton>
      {isOpen ? (
        <div className="absolute right-0 z-30 mt-2 w-64 border-4 border-[#0f1645] bg-[#2053d6] p-2 shadow-[0_5px_0_0_#0f1645]">
          <div className="mb-2 border-b-4 border-[#0f1645] pb-2 font-mono text-xs font-black uppercase text-blue-100">
            Supported Networks
          </div>
          <div className="space-y-2">
            {supportedChains.map((chain) => {
              const isActive = chain.id === chainId;
              return (
                <button
                  key={chain.id}
                  type="button"
                  className={`w-full border-4 px-3 py-2 text-left font-mono text-xs font-black uppercase shadow-[0_3px_0_0_#0f1645] ${
                    isActive
                      ? 'border-[#9b6900] bg-[#ffca28] text-[#1c2452]'
                      : 'border-[#0f1645] bg-[#1c63ff] text-white'
                  }`}
                  onClick={() => {
                    setIsOpen(false);
                    if (!isConnected || isActive) return;
                    switchChain({ chainId: chain.id });
                  }}
                  disabled={isPending || !isConnected}
                >
                  {chain.name}
                </button>
              );
            })}
          </div>
          {!isConnected ? (
            <div className="mt-2 font-mono text-[10px] font-bold uppercase text-blue-100">
              Connect wallet to switch network.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ mounted, account, chain, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!connected) {
          return (
            <div className="flex flex-col items-end gap-1">
              <PixelButton
                variant="green"
                className={navbarControlClassName}
                onClick={openConnectModal}
                title={!hasWalletConnectProjectId ? 'Add VITE_WALLETCONNECT_PROJECT_ID in your .env file to enable WalletConnect-based wallets.' : undefined}
              >
                Connect Wallet
              </PixelButton>
              {!hasWalletConnectProjectId ? (
                <span className="max-w-[220px] text-right font-mono text-[10px] font-bold uppercase text-blue-100">
                  Add `VITE_WALLETCONNECT_PROJECT_ID` to enable WalletConnect.
                </span>
              ) : null}
            </div>
          );
        }

        if (chain.unsupported) {
          return (
            <PixelButton variant="gold" className={navbarControlClassName} onClick={openChainModal}>
              Wrong Network
            </PixelButton>
          );
        }

        return (
          <div className="flex flex-col items-end gap-2">
            <PixelButton variant="green" className={navbarControlClassName} onClick={openAccountModal}>
              {account.displayName}
            </PixelButton>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

function PixelBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#2f7cf4_0%,#58a7ff_35%,#74c0ff_55%,#2b5fcf_56%,#1d2f71_100%)]" />
      <div className="absolute inset-x-0 top-[86px] h-[360px] bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_18px,rgba(255,255,255,0.18)_18px,rgba(255,255,255,0.18)_22px)] opacity-60" />
      <div className="absolute left-0 top-[320px] h-10 w-full bg-[#b84a38] shadow-[0_4px_0_0_#6e241a]" />
      <div className="absolute left-0 top-[360px] h-[520px] w-full bg-[repeating-linear-gradient(to_right,#233160_0,#233160_22px,#2a396c_22px,#2a396c_44px)] opacity-70" />
      <div className="absolute left-0 top-[720px] h-24 w-24 border-y-4 border-r-4 border-[#5a241c] bg-[#cf7d4c]" />
      <div className="absolute right-6 top-[700px] h-24 w-28 border-y-4 border-l-4 border-[#5a241c] bg-[#cf7d4c]" />
    </div>
  );
}

function PixelPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pixel-panel">
      <div className="pixel-panel__title">
        {title}
      </div>
      <div className="pixel-panel__body">{children}</div>
    </section>
  );
}

function PixelStatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="pixel-stat-card">
      <div className="pixel-stat-card__row">
        <div className="pixel-stat-card__left">
          <span className="pixel-stat-card__icon">{icon}</span>
          <span className="pixel-stat-card__label">{label}</span>
        </div>
        <span className="pixel-stat-card__value">{value}</span>
      </div>
    </div>
  );
}

function PixelButton({
  children,
  variant = 'blue',
  className = '',
  onClick,
  title,
  disabled = false,
}: {
  children: ReactNode;
  variant?: 'blue' | 'gold' | 'green' | 'purple';
  className?: string;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`pixel-button pixel-button--${variant} ${disabled ? 'pixel-button--disabled' : ''} ${className}`}
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function PixelSelectButton({
  children,
  active = false,
  onClick,
  className = '',
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pixel-select-button ${active ? 'pixel-select-button--active' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

function PixelToggleChip({
  label,
  subtitle,
  dotClass,
  active = false,
  onClick,
}: {
  label: string;
  subtitle?: string;
  dotClass: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pixel-toggle-chip ${active ? 'pixel-toggle-chip--active' : ''}`}
    >
      <span className="pixel-toggle-chip__left">
        <span className={`h-3 w-3 border border-black ${dotClass}`} />
        <span>{label}</span>
      </span>
      {subtitle ? <span className="pixel-toggle-chip__subtitle">{subtitle}</span> : null}
    </button>
  );
}

function PixelSlider({
  min,
  max,
  step,
  value,
  onChange,
  valueLabel,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  valueLabel: string;
}) {
  return (
    <div className="pixel-slider">
      <div className="pixel-slider__header">
        <span className="pixel-slider__limit">
          {min}
        </span>
        <span className="pixel-slider__value">
          {valueLabel}
        </span>
        <span className="pixel-slider__limit">
          {max}
        </span>
      </div>
      <input
        className="slider pixel-slider__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function PixelDropdown({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="pixel-dropdown"
    >
      <span>{label}</span>
      <span>▾</span>
    </button>
  );
}

function PixelTab({
  children,
  active = false,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pixel-tab ${active ? 'pixel-tab--active' : ''}`}
    >
      {children}
    </button>
  );
}

function PixelInput({
  placeholder,
  value,
  onChange,
  type = 'text',
  min,
  step,
}: {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  type?: 'text' | 'number';
  min?: string;
  step?: string;
}) {
  return (
    <input
      className="pixel-input"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      type={type}
      min={min}
      step={step}
    />
  );
}

function PanelLabel({ children }: { children: ReactNode }) {
  return <div className="panel-label">{children}</div>;
}

function MatchRow({ match, onJoin }: { match: Match; onJoin: () => void }) {
  const canJoin = match.statusCode === 0;

  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-4 font-mono text-sm font-black text-white md:grid-cols-[120px_1.2fr_140px_140px_100px_120px_160px_110px] md:items-center">
      <div>{match.id}</div>
      <div>{match.assets}</div>
      <div>{match.buyIn}</div>
      <div>{match.duration}</div>
      <div>{match.players}</div>
      <div>
        <span className="match-status-pill">
          {match.status}
        </span>
      </div>
      <div>{match.winner}</div>
      <div>
        <PixelButton variant="blue" className="w-full text-sm md:w-auto" onClick={onJoin} disabled={!canJoin}>
          Join
        </PixelButton>
      </div>
    </div>
  );
}

function JoinMatchModal({
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

function CreateMatchModal({
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
  matchCreationMode: 'empty' | 'creator-joins' | 'reserved';
  reservedOpponentAddress: string;
  onAssetsChange: (asset: string) => void;
  onBuyInChange: (buyIn: number) => void;
  selectedDurationHours: number;
  onDurationChange: (duration: number) => void;
  onMatchCreationModeChange: (value: 'empty' | 'creator-joins' | 'reserved') => void;
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
    if (!canSubmit || !hyperDuelContractAddress) return;

    if (matchCreationMode === 'empty') {
      writeCreateMatch({
        address: hyperDuelContractAddress,
        abi: hyperDuelAbi,
        functionName: 'createMatch',
        args: [tokensAllowed, buyInAmount, durationInSeconds],
      });
      return;
    }

    if (matchCreationMode === 'creator-joins') {
      writeCreateMatch({
        address: hyperDuelContractAddress,
        abi: hyperDuelAbi,
        functionName: 'createMatchAndJoin',
        args: [tokensAllowed, buyInAmount, durationInSeconds],
      });
      return;
    }

    writeCreateMatch({
      address: hyperDuelContractAddress,
      abi: hyperDuelAbi,
      functionName: 'askForMatch',
      args: [trimmedReservedOpponentAddress as Address, tokensAllowed, buyInAmount, durationInSeconds],
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
              Choose whether the match starts empty, starts with the creator as Player A, or is created as a reserved proposal for a specific Player B.
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
                  The selected address will need to accept the match proposal before the reserved match begins.
                </p>
              </div>
            ) : (
              <p className="mt-3 font-mono text-xs font-bold leading-5 text-slate-300">
                Anyone can join this match as the second player once it is created.
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
                    : 'Reserved proposal, creator joins as Player A'}
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
              Action:{' '}
              {matchCreationMode === 'empty'
                ? 'createMatch'
                : matchCreationMode === 'creator-joins'
                  ? 'createMatchAndJoin'
                  : 'askForMatch'}
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

function formatDuration(hours: number) {
  if (hours < 24) return `${hours} Hour${hours === 1 ? '' : 's'}`;

  const days = hours / 24;
  if (Number.isInteger(days)) return `${days} Day${days === 1 ? '' : 's'}`;

  return `${hours} Hours`;
}

function formatDurationFromSeconds(durationInSeconds: bigint) {
  const oneHour = 3600n;
  const oneDay = 86400n;
  const oneWeek = 604800n;

  if (durationInSeconds >= oneWeek && durationInSeconds % oneWeek === 0n) {
    const weeks = durationInSeconds / oneWeek;
    return `${weeks.toString()} Week${weeks === 1n ? '' : 's'}`;
  }

  if (durationInSeconds >= oneDay && durationInSeconds % oneDay === 0n) {
    const days = durationInSeconds / oneDay;
    return `${days.toString()} Day${days === 1n ? '' : 's'}`;
  }

  if (durationInSeconds >= oneHour && durationInSeconds % oneHour === 0n) {
    const hours = durationInSeconds / oneHour;
    return `${hours.toString()} Hour${hours === 1n ? '' : 's'}`;
  }

  return `${durationInSeconds.toString()}s`;
}

function compactNumber(value: string) {
  if (!value.includes('.')) return value;
  return value.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

function formatAddress(address: Address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatSpotPriceLabel(value: bigint | null | undefined, decimals: number | null | undefined) {
  if (value === null || value === undefined || decimals === null || decimals === undefined) return '...';
  if (value === 0n) return '0';

  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  const decimalText = fractionText ? `${whole.toString()}.${fractionText}` : whole.toString();

  return `$${decimalText}`;
}
