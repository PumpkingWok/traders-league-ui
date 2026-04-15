import { useEffect, useMemo, useState } from 'react';
import { useChainId, usePublicClient, useReadContract } from 'wagmi';
import { hyperDuelAbi } from '../config/abis';
import { hyperDuelContractByChainId } from '../config/contracts';
import { supportedChains } from '../config/networks';

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
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const hyperDuelContractAddress = hyperDuelContractByChainId[chainId];
  const [statsCounts, setStatsCounts] = useState({
    open: 0,
    live: 0,
    completed: 0,
  });

  const { data: latestMatchIdData } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'matchId',
    query: {
      enabled: Boolean(hyperDuelContractAddress),
    },
  });

  useEffect(() => {
    if (!publicClient || !hyperDuelContractAddress || latestMatchIdData === undefined) {
      setStatsCounts({ open: 0, live: 0, completed: 0 });
      return;
    }

    const latestMatchId = Number(latestMatchIdData);
    if (!Number.isFinite(latestMatchId) || latestMatchId < 1) {
      setStatsCounts({ open: 0, live: 0, completed: 0 });
      return;
    }

    let cancelled = false;
    const fetchStats = async () => {
      try {
        const matchIds = Array.from({ length: latestMatchId }, (_, index) => BigInt(index + 1));
        const matchesData = await Promise.allSettled(
          matchIds.map((id) =>
            publicClient.readContract({
              address: hyperDuelContractAddress,
              abi: hyperDuelAbi,
              functionName: 'matches',
              args: [id],
            }),
          ),
        );

        if (cancelled) return;

        let open = 0;
        let live = 0;
        let completed = 0;

        matchesData.forEach((result) => {
          if (result.status !== 'fulfilled') return;
          const match = result.value as readonly unknown[];
          const status = Number(match[6] ?? -1);
          if (status === 0) open += 1;
          else if (status === 1) live += 1;
          else if (status === 2) completed += 1;
        });

        setStatsCounts({ open, live, completed });
      } catch {
        if (!cancelled) setStatsCounts({ open: 0, live: 0, completed: 0 });
      }
    };

    void fetchStats();
    return () => {
      cancelled = true;
    };
  }, [hyperDuelContractAddress, latestMatchIdData, publicClient]);

  const stats = useMemo(
    () => [
      { label: 'Open Matches', value: String(statsCounts.open), icon: '01' },
      { label: 'Live Matches', value: String(statsCounts.live), icon: '02' },
      { label: 'Completed Matches', value: String(statsCounts.completed), icon: '03' },
      { label: 'Supported Chains', value: String(supportedChains.length), icon: '04' },
    ],
    [statsCounts.completed, statsCounts.live, statsCounts.open],
  );

  return (
    <>
      <section className="border border-[#a8a8a8] bg-[#f1f1f1]">
        <div className="h-1 w-full bg-[linear-gradient(90deg,#8f83ff_0%,#7ed8ff_50%,#8f83ff_100%)]" />
        <div className="grid grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[1.15fr_1fr] md:px-8 md:py-7">
          <div className="space-y-5">
            <div className="inline-flex border border-[#9d9d9d] bg-[#e7e7e7] px-3 py-1 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#505050]">
              Game Lobby
            </div>
            <div>
              <h1 className="font-mono text-3xl font-black uppercase tracking-[0.06em] text-[#2b2b2b] md:text-5xl">
                Compete in 1v1 Trading Battles
              </h1>
              <ul className="mt-5 space-y-2 font-mono text-sm font-black uppercase tracking-[0.05em] text-[#4a4a4a] md:text-base">
                <li>Create a match</li>
                <li>Set buy-in and duration</li>
                <li>Trade virtual assets</li>
                <li>Win the pot</li>
              </ul>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onOpenCreateMatch}
                className="border border-[#8f83ff] bg-[#ece9ff] px-4 py-2 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#453e9d] hover:bg-[#e3deff]"
              >
                Create Match
              </button>
              <button
                type="button"
                onClick={onBrowseMatches}
                className="border border-[#9d9d9d] bg-[#f6f6f6] px-4 py-2 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#3f3f3f] hover:bg-[#eaeaea]"
              >
                Browse Matches
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {stats.map((stat) => (
              <div key={stat.label} className="border border-[#b2b2b2] bg-[#f8f8f8] px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex border border-[#b8b8b8] bg-[#ebebeb] px-2 py-1 font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#646464]">
                    {stat.icon}
                  </div>
                  <div className="font-mono text-2xl font-black text-[#2d2d2d] md:text-3xl">{stat.value}</div>
                </div>
                <div className="mt-2 border-t border-[#d0d0d0] pt-2 font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#5a5a5a]">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-to-play" className="mt-6 border border-[#a8a8a8] bg-[#f4f4f4]">
        <div className="border-b border-[#bcbcbc] bg-[#ebebeb] px-4 py-3 md:px-6">
          <div className="font-mono text-lg font-black uppercase tracking-[0.08em] text-[#363636]">
            How To Play
          </div>
        </div>
        <div className="space-y-4 px-4 py-4 md:px-6 md:py-6">
          <div className="grid gap-4 md:grid-cols-2">
            {howToPlaySteps.map((step, index) => (
              <div
                key={step.title}
                className="border border-[#b7b7b7] bg-[#f9f9f9] px-4 py-4"
              >
                <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#6a6a6a]">
                  Step {index + 1}
                </div>
                <h3 className="mt-2 font-mono text-lg font-black uppercase tracking-[0.06em] text-[#2f2f2f] md:text-xl">
                  {step.title}
                </h3>
                <p className="mt-3 font-mono text-sm font-bold leading-6 text-[#505050]">
                  {step.description}
                </p>
              </div>
            ))}
          </div>

          <div className="border border-[#8f83ff] bg-[#eeebff] px-4 py-4">
            <div className="font-mono text-sm font-black uppercase tracking-[0.08em] text-[#4e459f]">
              Win Condition
            </div>
            <p className="mt-2 font-mono text-sm font-bold leading-6 text-[#4c4c61]">
              Both players begin with 100K virtual USD. When the timer ends, the player with the
              highest portfolio value in virtual USD wins the match prize.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
