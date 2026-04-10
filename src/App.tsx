import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { hasWalletConnectProjectId, hyperliquidEvmChain, supportedChains } from './wallet';

const stats = [
  { label: 'Open Matches', value: '12', icon: '📦' },
  { label: 'Live Matches', value: '6', icon: '⚔️' },
  { label: 'Completed Matches', value: '134', icon: '🏆' },
  { label: 'Supported Chains', value: String(supportedChains.length), icon: '🌐' },
];

const assets = [
  { label: 'BTC', color: 'bg-orange-500' },
  { label: 'ETH', color: 'bg-slate-300' },
  { label: 'SOL', color: 'bg-emerald-500' },
  { label: 'MATIC', color: 'bg-fuchsia-500' },
];

const hyperDuelContractAddress = '0xA1b2C3d4E5f60718293aBcDeF1234567890AbCdE' as Address;

const assetTokenIds: Record<string, number> = {
  BTC: 1,
  ETH: 2,
  SOL: 3,
  MATIC: 4,
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
      { name: 'tokensAllowed', type: 'uint32[]' },
    ],
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
  assets: string;
  buyIn: string;
  duration: string;
  players: string;
  status: string;
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isConnected } = useAccount();
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

  const navigateToHowToPlay = () => {
    if (location.pathname !== '/') {
      navigate('/', { state: { scrollToHowToPlay: true } });
      return;
    }

    requestAnimationFrame(() => {
      document.getElementById('how-to-play')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  useEffect(() => {
    const routeState = location.state as { scrollToHowToPlay?: boolean } | null;
    if (!routeState?.scrollToHowToPlay) return;

    requestAnimationFrame(() => {
      document.getElementById('how-to-play')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!isConnected) {
      setHasAttemptedAutoSwitch(false);
      return;
    }

    if (hasAttemptedAutoSwitch || chainId === hyperliquidEvmChain.id) {
      return;
    }

    setHasAttemptedAutoSwitch(true);
    void switchChainAsync({ chainId: hyperliquidEvmChain.id }).catch(() => undefined);
  }, [chainId, hasAttemptedAutoSwitch, isConnected, switchChainAsync]);

  return (
    <div className="min-h-screen bg-[#1b2a7a] text-white overflow-x-hidden">
      <PixelBackground />

      <div className="relative z-10">
        <Navbar onNavigateToHowToPlay={navigateToHowToPlay} />

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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <CreateMatchModal
        isOpen={isCreateMatchModalOpen}
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
  const publicClient = usePublicClient();
  const [contractMatches, setContractMatches] = useState<
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
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [matchFilter, setMatchFilter] = useState<'current' | 'finished' | 'all'>('current');
  const [sortBy, setSortBy] = useState<'duration' | 'buyIn'>('duration');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const { data: latestMatchIdData } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'matchId',
  });

  const { data: buyInTokenAddressData } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'buyInToken',
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
    if (!publicClient || latestMatchIdData === undefined) {
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
        const records = await Promise.all(
          matchIds.map(async (id) => {
            const match = (await publicClient.readContract({
              address: hyperDuelContractAddress,
              abi: hyperDuelAbi,
              functionName: 'matches',
              args: [id],
            })) as unknown as {
              playerA: Address;
              playerB: Address;
              buyIn: bigint;
              duration: bigint;
              status: number | bigint;
              tokensAllowed: readonly number[] | readonly bigint[];
            };

            return {
              id,
              playerA: match.playerA,
              playerB: match.playerB,
              buyIn: BigInt(match.buyIn),
              duration: BigInt(match.duration),
              status: Number(match.status),
              tokensAllowed: match.tokensAllowed.map((tokenId) => Number(tokenId)),
            };
          }),
        );

        if (!cancelled) {
          setContractMatches(records);
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
  }, [latestMatchIdData, publicClient]);

  const displayMatches = useMemo(() => {
    const tokenLabelById = Object.entries(assetTokenIds).reduce<Record<number, string>>((accumulator, [label, id]) => {
      accumulator[id] = label;
      return accumulator;
    }, {});

    const filtered = contractMatches.filter((match) => {
      if (match.status === 3) return false;
      if (matchFilter === 'finished') return match.status === 2;
      if (matchFilter === 'current') return match.status === 0 || match.status === 1;
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

      return {
        id: `#${match.id.toString()}`,
        assets: assetsLabel,
        buyIn: `${compactNumber(formatUnits(match.buyIn, buyInTokenDecimals))} ${buyInTokenSymbol}`,
        duration: formatDurationFromSeconds(match.duration),
        players: `${playersCount}/2`,
        status: statusLabel,
      };
    });
  }, [buyInTokenDecimals, buyInTokenSymbol, contractMatches, matchFilter, sortBy, sortDirection]);

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
                <PixelTab active={matchFilter === 'current'} onClick={() => setMatchFilter('current')}>
                  Current
                </PixelTab>
                <PixelTab active={matchFilter === 'finished'} onClick={() => setMatchFilter('finished')}>
                  Finished
                </PixelTab>
                <PixelTab active={matchFilter === 'all'} onClick={() => setMatchFilter('all')}>
                  All
                </PixelTab>
              </div>
            </div>

            <div className="overflow-hidden border-4 border-[#1b2346] bg-[#14204a] shadow-[0_5px_0_0_#0b1029]">
              <div className="hidden grid-cols-[120px_1.2fr_140px_140px_100px_120px_110px] gap-4 border-b-4 border-[#26315f] bg-[#1d2b5f] px-4 py-3 font-mono text-xs font-black uppercase text-slate-200 md:grid">
                <div>Match ID</div>
                <div>Assets</div>
                <div>Buy-In</div>
                <div>Duration</div>
                <div>Players</div>
                <div>Status</div>
                <div>Action</div>
              </div>

              <div className="divide-y-4 divide-[#26315f]">
                {isLoadingMatches ? (
                  <div className="px-4 py-6 font-mono text-sm font-black uppercase text-slate-200">
                    Loading matches from contract...
                  </div>
                ) : matchesError ? (
                  <div className="px-4 py-6 font-mono text-sm font-black uppercase text-[#ff8f7f]">
                    Failed to load matches
                  </div>
                ) : displayMatches.length === 0 ? (
                  <div className="px-4 py-6 font-mono text-sm font-black uppercase text-slate-300">
                    No matches for this filter
                  </div>
                ) : (
                  displayMatches.map((match) => <MatchRow key={match.id} match={match} />)
                )}
              </div>
            </div>
          </div>
        </PixelPanel>
      </section>
    </section>
  );
}

function Navbar({
  onNavigateToHowToPlay,
}: {
  onNavigateToHowToPlay: () => void;
}) {
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
          <button type="button" className="hover:text-[#ffefb0]" onClick={onNavigateToHowToPlay}>
            How to Play
          </button>
        </nav>

        <div className="flex items-center gap-3">
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

  const activeChainName =
    supportedChains.find((chain) => chain.id === chainId)?.name ?? hyperliquidEvmChain.name;

  return (
    <div className="relative">
      <PixelButton variant="purple" onClick={() => setIsOpen((value) => !value)}>
        {activeChainName}
      </PixelButton>
      {isOpen ? (
        <div className="absolute right-0 z-30 mt-2 w-64 border-4 border-[#2e2276] bg-[#131d44] p-2 shadow-[0_5px_0_0_#2e2276]">
          <div className="mb-2 border-b-4 border-[#26315f] pb-2 font-mono text-xs font-black uppercase text-slate-300">
            Supported Networks
          </div>
          <div className="space-y-2">
            {supportedChains.map((chain) => {
              const isActive = chain.id === chainId;
              return (
                <button
                  key={chain.id}
                  type="button"
                  className={`w-full border-4 px-3 py-2 text-left font-mono text-xs font-black uppercase shadow-[0_3px_0_0_#162141] ${
                    isActive
                      ? 'border-[#0b2f7b] bg-[#1c63ff] text-white'
                      : 'border-[#26315f] bg-[#10173a] text-slate-200'
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
            <div className="mt-2 font-mono text-[10px] font-bold uppercase text-slate-400">
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
            <PixelButton variant="gold" onClick={openChainModal}>
              Wrong Network
            </PixelButton>
          );
        }

        return (
          <div className="flex flex-col items-end gap-2">
            <PixelButton variant="green" onClick={openAccountModal}>
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
    <section className="border-4 border-[#4a261a] bg-[#20325f]/95 shadow-[0_6px_0_0_#3a1d14] backdrop-blur-sm">
      <div className="border-b-4 border-[#4a261a] bg-[#6f3b1e] px-4 py-3 font-mono text-2xl font-black uppercase text-[#ffd88a] md:px-5">
        {title}
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
}

function PixelStatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="border-4 border-[#4a261a] bg-[#6f3b1e] px-4 py-4 shadow-[0_5px_0_0_#3a1d14]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <span className="font-mono text-base font-black uppercase text-[#fff2cf]">{label}</span>
        </div>
        <span className="font-mono text-4xl font-black text-white">{value}</span>
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
  const styles = {
    blue: 'bg-[#1c63ff] text-white border-[#0b2f7b] shadow-[0_4px_0_0_#0b2f7b]',
    gold: 'bg-[#ffca28] text-[#1c2452] border-[#9b6900] shadow-[0_4px_0_0_#9b6900]',
    green: 'bg-[#33b443] text-white border-[#14621f] shadow-[0_4px_0_0_#14621f]',
    purple: 'bg-[#6646ff] text-white border-[#2e2276] shadow-[0_4px_0_0_#2e2276]',
  };

  return (
    <button
      className={`inline-flex items-center justify-center border-4 px-4 py-2 font-mono text-lg font-black uppercase transition-transform ${
        disabled ? 'cursor-not-allowed opacity-60' : 'hover:translate-y-[1px] active:translate-y-[2px]'
      } ${styles[variant]} ${className}`}
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
      className={`border-4 px-4 py-2 font-mono text-sm font-black uppercase shadow-[0_4px_0_0_#162141] ${
        active
          ? 'border-[#0b2f7b] bg-[#1c63ff] text-white'
          : 'border-[#26315f] bg-[#131d44] text-slate-200'
      } ${className}`}
    >
      {children}
    </button>
  );
}

function PixelToggleChip({
  label,
  dotClass,
  active = false,
  onClick,
}: {
  label: string;
  dotClass: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border-4 px-3 py-2 font-mono text-base font-black uppercase shadow-[0_4px_0_0_#162141] ${
        active ? 'border-[#0b2f7b] bg-[#1c63ff] text-white' : 'border-[#26315f] bg-[#131d44] text-slate-200'
      }`}
    >
      <span className={`h-3 w-3 border border-black ${dotClass}`} />
      <span>{label}</span>
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
    <div className="border-4 border-[#26315f] bg-[#131d44] px-4 py-4 shadow-[0_4px_0_0_#162141]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="font-mono text-xs font-black uppercase text-slate-300">
          {min}
        </span>
        <span className="font-mono text-lg font-black uppercase text-[#ffefb0]">
          {valueLabel}
        </span>
        <span className="font-mono text-xs font-black uppercase text-slate-300">
          {max}
        </span>
      </div>
      <input
        className="slider h-3 w-full cursor-pointer appearance-none rounded-none border-2 border-[#0b2f7b] bg-[#1d2b5f]"
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
      className="inline-flex items-center gap-2 border-4 border-[#26315f] bg-[#131d44] px-4 py-2 font-mono text-sm font-black uppercase text-slate-200 shadow-[0_4px_0_0_#162141]"
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
      className={`border-4 px-3 py-2 font-mono text-sm font-black uppercase shadow-[0_4px_0_0_#162141] ${
        active ? 'border-[#0b2f7b] bg-[#1c63ff] text-white' : 'border-[#26315f] bg-[#131d44] text-slate-200'
      }`}
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
      className="w-full border-4 border-[#26315f] bg-[#10173a] px-4 py-3 font-mono text-sm font-bold text-white outline-none placeholder:text-slate-400"
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
  return <div className="font-mono text-sm font-black uppercase text-[#e8edff]">{children}</div>;
}

function MatchRow({ match }: { match: Match }) {
  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-4 font-mono text-sm font-black text-white md:grid-cols-[120px_1.2fr_140px_140px_100px_120px_110px] md:items-center">
      <div>{match.id}</div>
      <div>{match.assets}</div>
      <div>{match.buyIn}</div>
      <div>{match.duration}</div>
      <div>{match.players}</div>
      <div>
        <span className="inline-flex border-4 border-[#26315f] bg-[#131d44] px-3 py-1 uppercase text-slate-100 shadow-[0_3px_0_0_#162141]">
          {match.status}
        </span>
      </div>
      <div>
        <PixelButton variant="blue" className="w-full text-sm md:w-auto">
          Join
        </PixelButton>
      </div>
    </div>
  );
}

function CreateMatchModal({
  isOpen,
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
  const { isConnected } = useAccount();
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const tokensAllowed = useMemo(
    () => selectedAssets.map((asset) => assetTokenIds[asset]).filter((tokenId): tokenId is number => tokenId !== undefined),
    [selectedAssets],
  );
  const buyInAmount = useMemo(() => parseUnits(selectedBuyIn.toString(), 6), [selectedBuyIn]);
  const durationInSeconds = useMemo(() => BigInt(selectedDurationHours * 60 * 60), [selectedDurationHours]);
  const trimmedReservedOpponentAddress = reservedOpponentAddress.trim();
  const reservedAddressIsValid = /^0x[a-fA-F0-9]{40}$/.test(trimmedReservedOpponentAddress);

  useEffect(() => {
    if (isConfirmed) {
      onClose();
    }
  }, [isConfirmed, onClose]);

  if (!isOpen) return null;

  const isReservedMatch = matchCreationMode === 'reserved';
  const hasAssetSelection = tokensAllowed.length > 0;
  const hasUnknownAssetSelection = tokensAllowed.length !== selectedAssets.length;
  const canSubmit =
    isConnected &&
    !isPending &&
    !isConfirming &&
    hasAssetSelection &&
    !hasUnknownAssetSelection &&
    (!isReservedMatch || reservedAddressIsValid);

  const handleConfirmMatch = () => {
    if (!canSubmit) return;

    if (matchCreationMode === 'empty') {
      writeContract({
        address: hyperDuelContractAddress,
        abi: hyperDuelAbi,
        functionName: 'createMatch',
        args: [tokensAllowed, buyInAmount, durationInSeconds],
      });
      return;
    }

    if (matchCreationMode === 'creator-joins') {
      writeContract({
        address: hyperDuelContractAddress,
        abi: hyperDuelAbi,
        functionName: 'createMatchAndJoin',
        args: [tokensAllowed, buyInAmount, durationInSeconds],
      });
      return;
    }

    writeContract({
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
              {assets.map((asset) => (
                <PixelToggleChip
                  key={asset.label}
                  label={asset.label}
                  dotClass={asset.color}
                  active={selectedAssets.includes(asset.label)}
                  onClick={() => onAssetsChange(asset.label)}
                />
              ))}
            </div>
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
            {hasUnknownAssetSelection ? (
              <div className="mt-2 text-[#ff8f7f]">One or more selected assets is missing a contract token id mapping.</div>
            ) : null}
            {error ? <div className="mt-2 break-all text-[#ff8f7f]">{error.message}</div> : null}
            {hash ? <div className="mt-2 break-all text-[#7fffb2]">Tx: {hash}</div> : null}
            {isConfirming ? <div className="mt-2 text-[#ffefb0]">Waiting for confirmation...</div> : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <PixelButton variant="blue" onClick={onClose}>
              Cancel
            </PixelButton>
            <PixelButton variant="gold" onClick={handleConfirmMatch} disabled={!canSubmit}>
              {isPending ? 'Confirm In Wallet' : isConfirming ? 'Creating Match...' : 'Confirm Match'}
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
