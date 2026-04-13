import { useEffect, useMemo, useState } from 'react';
import { formatUnits, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts } from 'wagmi';
import { erc20MetadataAbi, hyperDuelAbi } from '../config/abis';
import { hyperDuelContractByChainId, tokenIndexByChainId, zeroAddress } from '../config/contracts';
import { compactNumber, formatAddress, formatDurationFromSeconds } from '../utils/format';
import { PixelPanel, PixelTab } from '../components/pixel';
import { SwapPanel } from '../components/SwapPanel';

export default function MyMatchesPage() {
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
      currentWinner: Address;
      playerATotalUsd: bigint | null;
      playerBTotalUsd: bigint | null;
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

            let playerATotalUsd: bigint | null = null;
            let playerBTotalUsd: bigint | null = null;
            let currentWinner: Address = zeroAddress as Address;
            if (Number(match[6]) === 1 && playerA.toLowerCase() !== zeroAddress && playerB.toLowerCase() !== zeroAddress) {
              [playerATotalUsd, playerBTotalUsd] = (await Promise.all([
                publicClient.readContract({
                  address: hyperDuelContractAddress,
                  abi: hyperDuelAbi,
                  functionName: 'getPlayerTotalUsd',
                  args: [id, playerA],
                }),
                publicClient.readContract({
                  address: hyperDuelContractAddress,
                  abi: hyperDuelAbi,
                  functionName: 'getPlayerTotalUsd',
                  args: [id, playerB],
                }),
              ])) as [bigint, bigint];

              currentWinner =
                playerATotalUsd === playerBTotalUsd ? (zeroAddress as Address) : playerATotalUsd > playerBTotalUsd ? playerA : playerB;
            }

            return {
              id,
              playerA,
              playerB,
              currentWinner,
              playerATotalUsd,
              playerBTotalUsd,
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
                const currentWinnerLabel =
                  match.status === 1
                    ? match.currentWinner.toLowerCase() === zeroAddress
                      ? 'Undecided'
                      : formatAddress(match.currentWinner)
                    : '-';

                return (
                  <div key={match.id.toString()} className="border-4 border-[#26315f] bg-[#131d44] px-4 py-4 shadow-[0_4px_0_0_#162141]">
                    <div className="grid gap-3 font-mono text-sm font-bold text-white md:grid-cols-2">
                      <div><span className="text-slate-300">Match:</span> #{match.id.toString()}</div>
                      <div><span className="text-slate-300">Status:</span> {statusLabel}</div>
                      <div className="md:col-span-2"><span className="text-slate-300">Assets:</span> {assetsLabel}</div>
                      <div><span className="text-slate-300">Current Winner:</span> {currentWinnerLabel}</div>
                      <div><span className="text-slate-300">Players:</span> {formatAddress(match.playerA)} vs {formatAddress(match.playerB)}</div>
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
                          playerA={match.playerA}
                          playerB={match.playerB}
                          buyIn={match.buyIn}
                          buyInTokenSymbol={buyInTokenSymbol}
                          buyInTokenDecimals={buyInTokenDecimals}
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

