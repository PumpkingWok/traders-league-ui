import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { formatUnits, type Address } from 'viem';
import {
  useAccount,
  useChainId,
  useReadContract,
  useReadContracts,
  useSwitchChain,
} from 'wagmi';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { hyperliquidEvmChain, hyperliquidTestnetChain, supportedChains } from './config/networks';
import { erc20MetadataAbi, hyperDuelAbi } from './config/abis';
import {
  assetDotColorByLabel,
  hyperDuelContractByChainId,
  preferredAssetOrder,
  tokenAvatarUrlByLabel,
  tokenIndexByChainId,
} from './config/contracts';
import { compactNumber, formatDuration } from './utils/format';
import { type MatchCreationMode } from './types/match';
import { CreateMatchModal } from './components/CreateMatchModal';
import {
  PixelBackground,
} from './components/pixel';
import HomePage from './pages/Home';
import MatchesPage from './pages/Matches';
import MyMatchesPage from './pages/MyMatches';
import DashboardPage from './pages/Dashboard';
import './ui.css';

const navbarControlClassName = 'h-[30px]';
const themeStorageKey = 'traders-league-theme';
type ThemeMode = 'light' | 'dark';

export default function App() {
  const navigate = useNavigate();
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const [isCreateMatchModalOpen, setIsCreateMatchModalOpen] = useState(false);
  const [selectedBuyIn, setSelectedBuyIn] = useState(25);
  const [selectedDurationHours, setSelectedDurationHours] = useState(4);
  const [selectedAssets, setSelectedAssets] = useState<string[]>(['BTC', 'ETH']);
  const [matchCreationMode, setMatchCreationMode] = useState<MatchCreationMode>('creator-joins');
  const [reservedOpponentAddress, setReservedOpponentAddress] = useState('');
  const [matchesRefreshNonce, setMatchesRefreshNonce] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
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
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    if (storedTheme === 'light' || storedTheme === 'dark') {
      setThemeMode(storedTheme);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(themeStorageKey, themeMode);
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
  }, [themeMode]);

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
    <div className="app-shell flex min-h-screen flex-col overflow-x-hidden bg-[#e3e3e3] text-white">
      <PixelBackground />

      <div className="relative z-10 flex min-h-screen flex-col">
        <Navbar buyInBalanceLabel={buyInBalanceLabel} themeMode={themeMode} onThemeModeChange={setThemeMode} />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 pt-6 md:px-6 lg:px-8">
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
                  refreshNonce={matchesRefreshNonce}
                />
              }
            />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/my-matches" element={<MyMatchesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <Footer />
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
        onCreated={() => setMatchesRefreshNonce((value) => value + 1)}
        onClose={() => setIsCreateMatchModalOpen(false)}
      />
    </div>
  );
}

function Footer() {
  const footerItemClass =
    'inline-flex items-center gap-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#4f48a8] transition-colors hover:text-[#3b3592] hover:underline';

  return (
    <footer className="mt-auto border-t border-[#9f9f9f] bg-[#ececec] text-[#2e2e2e]">
      <div className="h-[2px] w-full bg-[linear-gradient(90deg,#8f83ff_0%,#7ed8ff_50%,#8f83ff_100%)]" />
      <div className="border-b border-[#b4b4b4] bg-[#f2f2f2]">
        <div className="w-full px-2 py-3 md:px-3">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-center md:pt-1">
              <TradersLeagueLogo />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 md:flex-1 md:px-6 lg:px-10">
              <div className="space-y-2">
                <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#4a4a4a]">
                  Community
                </div>
                <div className="flex flex-col gap-2">
                  <a href="" className={footerItemClass}>
                    <TelegramIcon className="h-3.5 w-3.5" />
                    Telegram
                  </a>
                  <a href="" className={footerItemClass}>
                    <XIcon className="h-3.5 w-3.5" />
                    X
                  </a>
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#4a4a4a]">
                  Documentation
                </div>
                <div className="flex flex-col gap-2">
                  <a
                    href="https://github.com/PumpkingWok/traders-league-ui"
                    target="_blank"
                    rel="noreferrer"
                    className={footerItemClass}
                  >
                    <GitHubIcon className="h-3.5 w-3.5" />
                    UI
                  </a>
                  <a
                    href="https://github.com/PumpkingWok/traders-league"
                    target="_blank"
                    rel="noreferrer"
                    className={footerItemClass}
                  >
                    <GitHubIcon className="h-3.5 w-3.5" />
                    Contracts
                  </a>
                </div>
              </div>
            </div>

            <div className="flex items-center font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#666] md:justify-end md:pt-1">
              Bring Human interactions onchain.
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function TradersLeagueLogo({ className }: { className?: string }) {
  return (
    <svg
      aria-label="Traders League logo"
      width="152"
      height="38"
      viewBox="0 0 304 76"
      className={className ?? 'h-8 w-[152px]'}
    >
      <defs>
        <linearGradient id="tradersLeagueLogoFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b8b1ff" />
          <stop offset="55%" stopColor="#8f83ff" />
          <stop offset="100%" stopColor="#7ed8ff" />
        </linearGradient>
      </defs>

      <g>
        <text
          x="152"
          y="51"
          textAnchor="middle"
          fontFamily="Impact, Haettenschweiler, 'Arial Black', sans-serif"
          fontSize="38"
          fontWeight="900"
          letterSpacing="1.2"
          fill="url(#tradersLeagueLogoFill)"
          stroke="#d9e8ff"
          strokeWidth="4.5"
          paintOrder="stroke"
        >
          TRADERS LEAGUE
        </text>
      </g>
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2h3.308l-7.227 8.26L22.8 22h-6.636l-5.196-6.79L4.99 22H1.68l7.73-8.835L1.2 2h6.804l4.697 6.231L18.244 2zm-1.16 18h1.833L7.01 3.895H5.044L17.084 20z" />
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M21.93 4.37a1.5 1.5 0 0 0-1.59-.2L3.22 11.2a1.5 1.5 0 0 0 .14 2.83l4.15 1.38 1.52 4.9a1.5 1.5 0 0 0 2.67.52l2.45-3.1 4.21 3.1a1.5 1.5 0 0 0 2.36-.9l2.43-14.2a1.5 1.5 0 0 0-.82-1.36zM9.6 14.77l-.74 2.38-.88-2.83 8.55-5.85-6.93 6.3z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.2c-3.34.73-4.04-1.42-4.04-1.42-.54-1.37-1.32-1.74-1.32-1.74-1.08-.74.08-.73.08-.73 1.2.08 1.83 1.22 1.83 1.22 1.06 1.82 2.78 1.29 3.46.99.11-.77.42-1.29.76-1.59-2.67-.3-5.48-1.33-5.48-5.9 0-1.3.47-2.36 1.23-3.2-.12-.3-.53-1.52.12-3.17 0 0 1-.32 3.3 1.22a11.4 11.4 0 0 1 6 0c2.3-1.54 3.3-1.22 3.3-1.22.65 1.65.24 2.87.12 3.17.76.84 1.23 1.9 1.23 3.2 0 4.58-2.82 5.6-5.51 5.9.43.37.82 1.1.82 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5z" />
    </svg>
  );
}

function Navbar({
  buyInBalanceLabel,
  themeMode,
  onThemeModeChange,
}: {
  buyInBalanceLabel: string | null;
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
}) {
  const topNavLinkClassName = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 font-mono text-sm font-black uppercase tracking-[0.08em] ${
      isActive ? 'bg-[#5a53b6] text-[#f5f5ff]' : 'bg-transparent text-[#4a4a4a] hover:bg-[#dfdfdf]'
    }`;

  const bottomNavLinkClassName = ({ isActive }: { isActive: boolean }) =>
    `px-2 py-2 font-mono text-sm font-black uppercase tracking-[0.08em] ${
      isActive ? 'text-[#2e2e2e]' : 'text-[#555] hover:text-[#1f1f1f]'
    }`;

  return (
    <header className="sticky top-0 z-20 border-b border-[#9f9f9f] bg-[#ececec] text-[#2e2e2e]">
      <div className="border-b border-[#a3a3a3]">
        <div className="flex w-full items-center justify-between gap-4 px-2 md:px-3">
          <div className="flex items-stretch">
            <div className="flex items-center border-r border-[#9c9c9c] pr-4">
              <TradersLeagueLogo className="h-9 w-[170px]" />
            </div>
            <div className="hidden items-stretch md:flex">
              <NavLink to="/" className={topNavLinkClassName}>
                Home
              </NavLink>
              <NavLink to="/dashboard" className={topNavLinkClassName}>
                Dashboard
              </NavLink>
              <NavLink to="/matches" className={topNavLinkClassName}>
                Matches
              </NavLink>
              <NavLink to="/my-matches" className={topNavLinkClassName}>
                My Matches
              </NavLink>
              <TournamentNavTeaser mode="top" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:block">
              <NetworkSelector />
            </div>
            <WalletButton />
            <ThemeTextToggle mode={themeMode} onModeChange={onThemeModeChange} />
          </div>
        </div>
      </div>

      <div className="border-b border-[#b4b4b4] bg-[#f2f2f2]">
        <div className="flex w-full items-center justify-between gap-4 px-2 py-1 md:px-3">
          <div className="flex items-center gap-2 md:hidden">
            <NavLink to="/" className={bottomNavLinkClassName}>
              Home
            </NavLink>
            <NavLink to="/dashboard" className={bottomNavLinkClassName}>
              Dashboard
            </NavLink>
            <NavLink to="/matches" className={bottomNavLinkClassName}>
              Matches
            </NavLink>
            <NavLink to="/my-matches" className={bottomNavLinkClassName}>
              My Matches
            </NavLink>
            <TournamentNavTeaser mode="bottom" />
          </div>
          <div className="hidden items-center gap-5 md:flex">
            {buyInBalanceLabel ? (
              <div className="font-mono text-[12px] font-black uppercase tracking-[0.08em] text-[#686868]">
                Balance: <span className="text-[#2f2f2f]">{buyInBalanceLabel}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="h-[2px] w-full bg-[linear-gradient(90deg,#8f83ff_0%,#7ed8ff_50%,#8f83ff_100%)]" />

      {buyInBalanceLabel ? (
        <div className="border-b border-[#a3a3a3] px-4 py-2 md:hidden">
          <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#4f4f4f]">
            Balance: <span className="text-[#2f2f2f]">{buyInBalanceLabel}</span>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function TournamentNavTeaser({ mode }: { mode: 'top' | 'bottom' }) {
  const teaserClassName =
    mode === 'top'
      ? 'px-4 py-2 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#4a4a4a] hover:bg-[#dfdfdf]'
      : 'px-2 py-2 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#555] hover:text-[#1f1f1f]';

  const tooltipClassName =
    mode === 'top'
      ? 'top-full mt-2 min-w-[220px]'
      : 'top-full mt-1 min-w-[200px]';

  return (
    <div className="group relative">
      <div className={`${teaserClassName} cursor-help`}>Tournaments</div>
      <div
        className={`pointer-events-none invisible absolute left-1/2 z-30 -translate-x-1/2 border border-[#9c9c9c] bg-[#ffffff] px-3 py-2 text-center font-mono text-[10px] font-black uppercase tracking-[0.08em] text-[#6a5600] opacity-0 shadow-[0_8px_18px_rgba(0,0,0,0.14)] transition duration-150 group-hover:visible group-hover:opacity-100 ${tooltipClassName}`}
      >
        Coming Soon: Tournaments Mode
      </div>
    </div>
  );
}

function NetworkSelector() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const activeChain = supportedChains.find((chain) => chain.id === chainId) ?? hyperliquidTestnetChain;
  const activeChainName = activeChain.name;
  const activeChainIconUrl = tokenAvatarUrlByLabel.HYPE;
  const mainnetChains = supportedChains.filter((chain) => !chain.testnet);
  const testnetChains = supportedChains.filter((chain) => Boolean(chain.testnet));

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
      <button
        type="button"
        className={`inline-flex items-center gap-2 border border-[#b4b4b4] bg-[#f4f4f4] px-2 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#3d3d3d] hover:bg-[#e6e6e6] ${navbarControlClassName}`}
        onClick={() => setIsOpen((value) => !value)}
        aria-label={`Select network (current: ${activeChainName})`}
      >
        <img
          src={activeChainIconUrl}
          alt={`${activeChainName} icon`}
          className="h-5 w-5 rounded-full border border-[#a7a7a7] object-cover"
          loading="lazy"
        />
        <span aria-hidden="true" className="text-xs leading-none text-[#666]">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>
      {isOpen ? (
        <div className="absolute right-0 top-full z-30 w-64 border border-[#9c9c9c] bg-[#f5f5f5] p-2 shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
          <div className="mb-2 border-b border-[#c0c0c0] pb-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#515151]">
            Supported Networks
          </div>
          <div className="space-y-3">
            {mainnetChains.length > 0 ? (
              <div className="space-y-2">
                <div className="font-mono text-[10px] font-black uppercase tracking-[0.08em] text-[#656565]">Mainnet</div>
                {mainnetChains.map((chain) => {
                  const isActive = chain.id === chainId;
                  return (
                    <button
                      key={chain.id}
                      type="button"
                      className={`flex w-full items-center gap-2 border px-3 py-2 text-left font-mono text-xs font-black uppercase tracking-[0.08em] ${
                        isActive
                          ? 'border-[#8f83ff] bg-[#ece9ff] text-[#403a92]'
                          : 'border-[#bdbdbd] bg-[#fff] text-[#474747] hover:bg-[#efefef]'
                      }`}
                      onClick={() => {
                        setIsOpen(false);
                        if (!isConnected || isActive) return;
                        switchChain({ chainId: chain.id });
                      }}
                      disabled={isPending || !isConnected}
                    >
                      <img
                        src={tokenAvatarUrlByLabel.HYPE}
                        alt={`${chain.name} icon`}
                        className="h-4 w-4 rounded-full border border-[#b8b8b8] object-cover"
                        loading="lazy"
                      />
                      <span>{chain.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {testnetChains.length > 0 ? (
              <div className="space-y-2">
                <div className="font-mono text-[10px] font-black uppercase tracking-[0.08em] text-[#656565]">Testnet</div>
                {testnetChains.map((chain) => {
                  const isActive = chain.id === chainId;
                  return (
                    <button
                      key={chain.id}
                      type="button"
                      className={`flex w-full items-center gap-2 border px-3 py-2 text-left font-mono text-xs font-black uppercase tracking-[0.08em] ${
                        isActive
                          ? 'border-[#8f83ff] bg-[#ece9ff] text-[#403a92]'
                          : 'border-[#bdbdbd] bg-[#fff] text-[#474747] hover:bg-[#efefef]'
                      }`}
                      onClick={() => {
                        setIsOpen(false);
                        if (!isConnected || isActive) return;
                        switchChain({ chainId: chain.id });
                      }}
                      disabled={isPending || !isConnected}
                    >
                      <img
                        src={tokenAvatarUrlByLabel.HYPE}
                        alt={`${chain.name} icon`}
                        className="h-4 w-4 rounded-full border border-[#b8b8b8] object-cover"
                        loading="lazy"
                      />
                      <span>{chain.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          {!isConnected ? (
            <div className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#757575]">
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
              <button
                type="button"
                className={`border border-[#b4b4b4] bg-[#f4f4f4] px-3 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#3d3d3d] hover:bg-[#e6e6e6] ${navbarControlClassName}`}
                onClick={openConnectModal}
              >
                Connect Wallet
              </button>
            </div>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              type="button"
              className={`border border-[#d9a200] bg-[#fff0bf] px-3 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#5d4900] hover:bg-[#ffe89a] ${navbarControlClassName}`}
              onClick={openChainModal}
            >
              Wrong Network
            </button>
          );
        }

        return (
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              className={`border border-[#b4b4b4] bg-[#f4f4f4] px-3 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#3d3d3d] hover:bg-[#e6e6e6] ${navbarControlClassName}`}
              onClick={openAccountModal}
            >
              {account.displayName}
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

function ThemeTextToggle({ mode, onModeChange }: { mode: ThemeMode; onModeChange: (mode: ThemeMode) => void }) {
  const buttonClass = (isActive: boolean) =>
    `h-[30px] min-w-[50px] border-2 px-2 font-mono text-sm font-black uppercase tracking-[0.08em] ${
      isActive
        ? 'border-[#7f72ff] bg-[#ece9ff] text-[#433d98]'
        : 'border-[#8f8f8f] bg-[#e7e7e7] text-[#3f3f3f] hover:bg-[#dddddd]'
    }`;
  return (
    <div className={`hidden items-stretch ${navbarControlClassName} md:flex`}>
      <button type="button" className={buttonClass(mode === 'light')} onClick={() => onModeChange('light')}>
        Light
      </button>
      <button type="button" className={buttonClass(mode === 'dark')} onClick={() => onModeChange('dark')}>
        Dark
      </button>
    </div>
  );
}
