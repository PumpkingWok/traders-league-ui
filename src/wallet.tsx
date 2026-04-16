import '@rainbow-me/rainbowkit/styles.css';

import {
  lightTheme,
  getDefaultConfig,
  RainbowKitProvider,
} from '@rainbow-me/rainbowkit';
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { defineChain, http } from 'viem';
import { WagmiProvider } from 'wagmi';

export const hyperliquidEvmChain = defineChain({
  id: 999,
  name: 'Hyperliquid EVM',
  nativeCurrency: {
    name: 'HYPE',
    symbol: 'HYPE',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.hyperliquid.xyz/evm'] },
  },
  blockExplorers: {
    default: {
      name: 'HyperEVMScan',
      url: 'https://hyperevmscan.io',
    },
  },
});

export const hyperliquidTestnetChain = defineChain({
  id: 998,
  name: 'Hyperliquid Evm testnet',
  nativeCurrency: {
    name: 'HYPE',
    symbol: 'HYPE',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpcs.chain.link/hyperevm/testnet'] },
  },
  blockExplorers: {
    default: {
      name: 'HyperEVMScan Testnet',
      url: 'https://testnet.hyperevmscan.io',
    },
  },
  testnet: true,
});

export const supportedChains = [hyperliquidEvmChain, hyperliquidTestnetChain] as const;

const walletConnectProjectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? 'REPLACE_WITH_YOUR_PROJECT_ID';

const config = getDefaultConfig({
  appName: 'Traders League',
  appDescription: 'Multichain virtual trading battles',
  appUrl: 'https://tradersleague.local',
  chains: [...supportedChains],
  transports: {
    [hyperliquidEvmChain.id]: http(),
    [hyperliquidTestnetChain.id]: http('https://rpcs.chain.link/hyperevm/testnet'),
  },
  wallets: [
    {
      groupName: 'Popular',
      wallets: [metaMaskWallet, rabbyWallet, coinbaseWallet],
    },
    {
      groupName: 'More options',
      wallets: [injectedWallet, walletConnectWallet],
    },
  ],
  projectId: walletConnectProjectId,
  ssr: false,
});

const baseTheme = lightTheme({
  accentColor: '#8f83ff',
  accentColorForeground: '#f5f5ff',
  borderRadius: 'none',
  overlayBlur: 'small',
  fontStack: 'system',
});

const tradersLeagueTheme = {
  ...baseTheme,
  colors: {
    ...baseTheme.colors,
    accentColor: '#8f83ff',
    accentColorForeground: '#f5f5ff',
    actionButtonBorder: '#b9b9b9',
    actionButtonBorderMobile: '#b9b9b9',
    actionButtonSecondaryBackground: '#efefef',
    closeButton: '#4f4f4f',
    closeButtonBackground: '#ececec',
    connectButtonBackground: '#ece9ff',
    connectButtonBackgroundError: '#f8e6e6',
    connectButtonInnerBackground: '#ece9ff',
    connectButtonText: '#433d98',
    connectButtonTextError: '#8a4747',
    connectionIndicator: '#8f83ff',
    downloadBottomCardBackground: '#f2f2f2',
    downloadTopCardBackground: '#ffffff',
    generalBorder: '#b9b9b9',
    generalBorderDim: '#d4d4d4',
    menuItemBackground: '#f3f3f3',
    modalBackdrop: 'rgba(20, 20, 20, 0.24)',
    modalBackground: '#f5f5f5',
    modalBorder: '#ababab',
    modalText: '#2f2f2f',
    modalTextDim: '#6a6a6a',
    modalTextSecondary: '#5f5f5f',
    profileAction: '#ece9ff',
    profileActionHover: '#e3deff',
    profileForeground: '#f9f9f9',
    selectedOptionBorder: '#8f83ff',
    standby: '#8f83ff',
  },
  shadows: {
    ...baseTheme.shadows,
    connectButton: 'none',
    dialog: '0 12px 30px rgba(0, 0, 0, 0.18)',
    profileDetailsAction: 'none',
    selectedOption: '0 0 0 2px #8f83ff',
    selectedWallet: '0 0 0 2px #8f83ff',
    walletLogo: 'none',
  },
  fonts: {
    body: '"SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", monospace',
  },
};

export function WalletProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider modalSize="compact" theme={tradersLeagueTheme}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export const hasWalletConnectProjectId =
  walletConnectProjectId !== 'REPLACE_WITH_YOUR_PROJECT_ID';
