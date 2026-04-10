import '@rainbow-me/rainbowkit/styles.css';

import {
  darkTheme,
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
  name: 'Hyperliquid Testnet',
  nativeCurrency: {
    name: 'HYPE',
    symbol: 'HYPE',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.hyperliquid-testnet.xyz/evm'] },
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
    [hyperliquidTestnetChain.id]: http(),
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

const tradersLeagueTheme = {
  ...darkTheme({
    accentColor: '#ffca28',
    accentColorForeground: '#1c2452',
    borderRadius: 'none',
    overlayBlur: 'none',
    fontStack: 'system',
  }),
  colors: {
    ...darkTheme({
      accentColor: '#ffca28',
      accentColorForeground: '#1c2452',
      borderRadius: 'none',
      overlayBlur: 'none',
      fontStack: 'system',
    }).colors,
    accentColor: '#ffca28',
    accentColorForeground: '#1c2452',
    actionButtonBorder: '#4a261a',
    actionButtonBorderMobile: '#4a261a',
    actionButtonSecondaryBackground: '#1d2b5f',
    closeButton: '#fff2cf',
    closeButtonBackground: '#6f3b1e',
    connectButtonBackground: '#33b443',
    connectButtonBackgroundError: '#b84a38',
    connectButtonInnerBackground: '#33b443',
    connectButtonText: '#ffffff',
    connectButtonTextError: '#ffffff',
    connectionIndicator: '#ffca28',
    downloadBottomCardBackground: '#131d44',
    downloadTopCardBackground: '#2053d6',
    generalBorder: '#4a261a',
    generalBorderDim: '#26315f',
    menuItemBackground: '#1d2b5f',
    modalBackdrop: 'rgba(13, 26, 63, 0.82)',
    modalBackground: '#20325f',
    modalBorder: '#4a261a',
    modalText: '#ffffff',
    modalTextDim: '#dbe7ff',
    modalTextSecondary: '#ffefb0',
    profileAction: '#1c63ff',
    profileActionHover: '#2053d6',
    profileForeground: '#14204a',
    selectedOptionBorder: '#ffca28',
    standby: '#ffca28',
  },
  shadows: {
    ...darkTheme({
      accentColor: '#ffca28',
      accentColorForeground: '#1c2452',
      borderRadius: 'none',
      overlayBlur: 'none',
      fontStack: 'system',
    }).shadows,
    connectButton: '0 4px 0 0 #14621f',
    dialog: '0 8px 0 0 #3a1d14',
    profileDetailsAction: '0 4px 0 0 #0b2f7b',
    selectedOption: '0 0 0 4px #ffca28',
    selectedWallet: '0 0 0 4px #ffca28',
    walletLogo: '0 4px 0 0 #162141',
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
