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
import { hasWalletConnectProjectId, hyperliquidEvmChain, hyperliquidTestnetChain, supportedChains } from './config/networks';
import { erc20MetadataAbi, hyperDuelAbi } from './config/abis';
import {
  assetDotColorByLabel,
  hyperDuelContractByChainId,
  preferredAssetOrder,
  preferredHyperDuelChainId,
  tokenIndexByChainId,
} from './config/contracts';
import { compactNumber, formatDuration } from './utils/format';
import { type MatchCreationMode } from './types/match';
import { CreateMatchModal } from './components/CreateMatchModal';
import {
  PixelBackground,
  PixelButton,
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
  const { switchChainAsync } = useSwitchChain();
  const [hasAttemptedAutoSwitch, setHasAttemptedAutoSwitch] = useState(false);
  const [isCreateMatchModalOpen, setIsCreateMatchModalOpen] = useState(false);
  const [selectedBuyIn, setSelectedBuyIn] = useState(25);
  const [selectedDurationHours, setSelectedDurationHours] = useState(4);
  const [selectedAssets, setSelectedAssets] = useState<string[]>(['BTC', 'ETH']);
  const [matchCreationMode, setMatchCreationMode] = useState<MatchCreationMode>('creator-joins');
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
