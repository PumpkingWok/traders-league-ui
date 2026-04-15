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
import './ui.css';

const navbarControlClassName = 'h-[52px]';

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
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#e3e3e3] text-white">
      <PixelBackground />

      <div className="relative z-10 flex min-h-screen flex-col">
        <Navbar buyInBalanceLabel={buyInBalanceLabel} />

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
  return (
    <footer className="mt-auto border-t border-[#9f9f9f] bg-[#ececec] text-[#2e2e2e]">
      <div className="h-[2px] w-full bg-[linear-gradient(90deg,#8f83ff_0%,#7ed8ff_50%,#8f83ff_100%)]" />
      <div className="border-b border-[#b4b4b4] bg-[#f2f2f2]">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
          <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#5f5f5f]">
            Traders League
          </div>
          <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#666]">
            Bring Human interactions onchain.
          </div>
        </div>
      </div>
    </footer>
  );
}

function Navbar({ buyInBalanceLabel }: { buyInBalanceLabel: string | null }) {
  const topNavLinkClassName = ({ isActive }: { isActive: boolean }) =>
    `border-x border-[#9c9c9c] px-4 py-3 font-mono text-base font-black uppercase tracking-[0.08em] ${
      isActive ? 'bg-[#5a53b6] text-[#f5f5ff]' : 'bg-transparent text-[#4a4a4a] hover:bg-[#dfdfdf]'
    }`;

  const bottomNavLinkClassName = ({ isActive }: { isActive: boolean }) =>
    `px-2 py-2 font-mono text-sm font-black uppercase tracking-[0.08em] ${
      isActive ? 'text-[#2e2e2e]' : 'text-[#555] hover:text-[#1f1f1f]'
    }`;

  return (
    <header className="sticky top-0 z-20 border-b border-[#9f9f9f] bg-[#ececec] text-[#2e2e2e]">
      <div className="h-2 w-full bg-[#4c4c4c]" />
      <div className="border-b border-[#a3a3a3]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 md:px-6 lg:px-8">
          <div className="flex items-stretch">
            <div className="flex items-center border-r border-[#9c9c9c] pr-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[conic-gradient(from_180deg,#ff5f6d,#ffc371,#33d1ff,#7a5fff,#ff5f6d)] text-[9px] font-black text-white">
                TL
              </div>
            </div>
            <div className="hidden items-stretch md:flex">
              <NavLink to="/" className={topNavLinkClassName}>
                Home
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

          <div className="flex items-center gap-2 py-2">
            <div className="hidden md:block">
              <NetworkSelector />
            </div>
            <WalletButton />
          </div>
        </div>
      </div>

      <div className="border-b border-[#b4b4b4] bg-[#f2f2f2]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-1 md:px-6 lg:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <NavLink to="/" className={bottomNavLinkClassName}>
              Home
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
            <div className="font-mono text-[13px] font-black uppercase tracking-[0.08em] text-[#4e4e4e]">Traders League</div>
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
      ? 'border-x border-[#9c9c9c] px-4 py-3 font-mono text-base font-black uppercase tracking-[0.08em] text-[#4a4a4a] hover:bg-[#dfdfdf]'
      : 'px-2 py-2 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#555] hover:text-[#1f1f1f]';

  const tooltipClassName =
    mode === 'top'
      ? 'top-full mt-2 min-w-[220px]'
      : 'top-full mt-1 min-w-[200px]';

  return (
    <div className="group relative">
      <div className={`${teaserClassName} cursor-help`}>Tournaments</div>
      <div
        className={`pointer-events-none invisible absolute left-1/2 z-30 -translate-x-1/2 border border-[#9c9c9c] bg-[#fff7d8] px-3 py-2 text-center font-mono text-[10px] font-black uppercase tracking-[0.08em] text-[#6a5600] opacity-0 shadow-[0_8px_18px_rgba(0,0,0,0.14)] transition duration-150 group-hover:visible group-hover:opacity-100 ${tooltipClassName}`}
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
      <button
        type="button"
        className={`border border-[#9c9c9c] bg-[#f4f4f4] px-4 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#3d3d3d] hover:bg-[#e6e6e6] ${navbarControlClassName}`}
        onClick={() => setIsOpen((value) => !value)}
      >
        {activeChainName}
      </button>
      {isOpen ? (
        <div className="absolute right-0 z-30 mt-2 w-64 border border-[#9c9c9c] bg-[#f5f5f5] p-2 shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
          <div className="mb-2 border-b border-[#c0c0c0] pb-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#515151]">
            Supported Networks
          </div>
          <div className="space-y-2">
            {supportedChains.map((chain) => {
              const isActive = chain.id === chainId;
              return (
                <button
                  key={chain.id}
                  type="button"
                  className={`w-full border px-3 py-2 text-left font-mono text-xs font-black uppercase tracking-[0.08em] ${
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
                  {chain.name}
                </button>
              );
            })}
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
                className={`border border-[#9c9c9c] bg-[#f4f4f4] px-4 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#3d3d3d] hover:bg-[#e6e6e6] ${navbarControlClassName}`}
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
              className={`border border-[#d9a200] bg-[#fff0bf] px-4 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#5d4900] hover:bg-[#ffe89a] ${navbarControlClassName}`}
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
              className={`border border-[#9c9c9c] bg-[#f4f4f4] px-4 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#3d3d3d] hover:bg-[#e6e6e6] ${navbarControlClassName}`}
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
