import { PixelButton, PixelPanel, PixelStatCard } from '../components/pixel';
import { supportedChains } from '../config/networks';

const stats = [
  { label: 'Open Matches', value: '12', icon: '📦' },
  { label: 'Live Matches', value: '6', icon: '⚔️' },
  { label: 'Completed Matches', value: '134', icon: '🏆' },
  { label: 'Supported Chains', value: String(supportedChains.length), icon: '🌐' },
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

export default function HomePage({
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
