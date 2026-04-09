import { useState, type ReactNode } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { hasWalletConnectProjectId } from './wallet';

const stats = [
  { label: 'Open Matches', value: '12', icon: '📦' },
  { label: 'Live Matches', value: '6', icon: '⚔️' },
  { label: 'Completed Matches', value: '134', icon: '🏆' },
  { label: 'Supported Chains', value: '4', icon: '🌐' },
];

const assets = [
  { label: 'BTC', color: 'bg-orange-500' },
  { label: 'ETH', color: 'bg-slate-300' },
  { label: 'SOL', color: 'bg-emerald-500' },
  { label: 'MATIC', color: 'bg-fuchsia-500' },
];

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

const matches = [
  { id: '#102', assets: 'BTC • ETH', buyIn: '25 USDC', duration: '1 Hour', players: '1/2', status: 'Open' },
  { id: '#101', assets: 'SOL • MATIC', buyIn: '50 USDC', duration: '4 Hours', players: '1/2', status: 'Open' },
  { id: '#100', assets: 'BTC • SOL', buyIn: '100 USDC', duration: '1 Day', players: '1/2', status: 'Open' },
  { id: '#099', assets: 'ETH • SOL', buyIn: '10 USDC', duration: '1 Week', players: '1/2', status: 'Open' },
  { id: '#098', assets: 'BTC • MATIC', buyIn: '25 USDC', duration: '1 Week', players: '1/2', status: 'Open' },
];

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

  return (
    <div className="min-h-screen bg-[#1b2a7a] text-white overflow-x-hidden">
      <PixelBackground />

      <div className="relative z-10">
        <Navbar />

        <main className="mx-auto max-w-7xl px-4 pb-12 pt-6 md:px-6 lg:px-8">
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
                <PixelButton variant="gold" onClick={() => setIsCreateMatchModalOpen(true)}>
                  Create Match
                </PixelButton>
                <a href="#matches">
                  <PixelButton variant="blue">Browse Matches</PixelButton>
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {stats.map((stat) => (
                <PixelStatCard key={stat.label} icon={stat.icon} label={stat.label} value={stat.value} />
              ))}
            </div>
          </section>

          <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[380px_1fr]">
            <PixelPanel title="Create a 1v1 Match">
              <div className="space-y-5">
                <div>
                  <PanelLabel>Select Assets</PanelLabel>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {assets.map((asset) => (
                      <PixelToggleChip
                        key={asset.label}
                        label={asset.label}
                        dotClass={asset.color}
                        active={selectedAssets.includes(asset.label)}
                        onClick={() => toggleAsset(asset.label)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <PanelLabel>Buy-in (USDC)</PanelLabel>
                  <div className="mt-2">
                    <PixelSlider
                      min={buyInRange.min}
                      max={buyInRange.max}
                      step={buyInRange.step}
                      value={selectedBuyIn}
                      onChange={setSelectedBuyIn}
                      valueLabel={`${selectedBuyIn} USDC`}
                    />
                  </div>
                </div>

                <div>
                  <PanelLabel>Duration</PanelLabel>
                  <div className="mt-2">
                    <PixelSlider
                      min={durationRange.min}
                      max={durationRange.max}
                      step={durationRange.step}
                      value={selectedDurationHours}
                      onChange={setSelectedDurationHours}
                      valueLabel={selectedDuration}
                    />
                  </div>
                </div>

                <div>
                  <PanelLabel>Match Type</PanelLabel>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <PixelSelectButton active>Public</PixelSelectButton>
                    <PixelSelectButton>Private (Coming Soon)</PixelSelectButton>
                  </div>
                </div>

                <p className="font-mono text-xs font-bold text-slate-300">
                  You will deposit the buy-in when creating the match.
                </p>

                <div className="border-t-4 border-[#26315f] pt-4">
                  <PanelLabel>Join by Match ID</PanelLabel>
                  <div className="mt-2 flex gap-2">
                    <PixelInput placeholder="Enter Match ID" />
                    <PixelButton variant="blue" className="shrink-0">
                      Join Match
                    </PixelButton>
                  </div>
                </div>
              </div>
            </PixelPanel>

            <div id="matches">
              <PixelPanel title="Open 1v1 Matches">
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap gap-2">
                      <PixelDropdown label="All Assets" />
                      <PixelDropdown label="All Buy-Ins" />
                      <PixelDropdown label="All Durations" />
                    </div>

                    <div className="flex items-center gap-2 self-start lg:self-auto">
                      <PixelTab active>Open</PixelTab>
                      <PixelTab>Live</PixelTab>
                      <PixelTab>Finished</PixelTab>
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
                      {matches.map((match) => (
                        <MatchRow key={match.id} match={match} />
                      ))}
                    </div>
                  </div>
                </div>
              </PixelPanel>
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

function Navbar() {
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
          <a className="border-b-4 border-[#ffbf3f] pb-1 text-[#ffefb0]" href="#">
            Home
          </a>
          <a className="hover:text-[#ffefb0]" href="#matches">
            Matches
          </a>
          <a className="hover:text-[#ffefb0]" href="#how-to-play">
            How to Play
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <PixelButton variant="purple" className="hidden md:inline-flex">
            MultiChain
          </PixelButton>
          <WalletButton />
        </div>
      </div>
    </header>
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
          <div className="flex flex-col items-end gap-2 sm:flex-row">
            <PixelButton variant="purple" onClick={openChainModal} className="hidden md:inline-flex">
              {chain.name ?? 'Network'}
            </PixelButton>
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
}: {
  children: ReactNode;
  variant?: 'blue' | 'gold' | 'green' | 'purple';
  className?: string;
  onClick?: () => void;
  title?: string;
}) {
  const styles = {
    blue: 'bg-[#1c63ff] text-white border-[#0b2f7b] shadow-[0_4px_0_0_#0b2f7b]',
    gold: 'bg-[#ffca28] text-[#1c2452] border-[#9b6900] shadow-[0_4px_0_0_#9b6900]',
    green: 'bg-[#33b443] text-white border-[#14621f] shadow-[0_4px_0_0_#14621f]',
    purple: 'bg-[#6646ff] text-white border-[#2e2276] shadow-[0_4px_0_0_#2e2276]',
  };

  return (
    <button
      className={`inline-flex items-center justify-center border-4 px-4 py-2 font-mono text-lg font-black uppercase transition-transform hover:translate-y-[1px] active:translate-y-[2px] ${styles[variant]} ${className}`}
      type="button"
      onClick={onClick}
      title={title}
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

function PixelTab({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
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
  if (!isOpen) return null;

  const creatorJoinsAsPlayerA = matchCreationMode !== 'empty';
  const isReservedMatch = matchCreationMode === 'reserved';

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

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <PixelButton variant="blue" onClick={onClose}>
              Cancel
            </PixelButton>
            <PixelButton variant="gold" onClick={onClose}>
              Confirm Match
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
