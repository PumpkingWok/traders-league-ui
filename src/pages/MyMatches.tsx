import { useEffect, useMemo, useState } from 'react';
import { formatUnits, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts } from 'wagmi';
import { erc20MetadataAbi, hyperDuelAbi } from '../config/abis';
import { hyperDuelContractByChainId, tokenAvatarUrlByLabel, tokenIndexByChainId, zeroAddress } from '../config/contracts';
import { compactNumber, formatAddress, formatDurationFromSeconds } from '../utils/format';
import { SwapPanel } from '../components/SwapPanel';

const platformFeeBase = 10_000n;
const usdVirtualPriceScale = 10_000n;

function formatMatchCountdown(remainingSeconds: bigint): string {
  if (remainingSeconds <= 0n) return 'Ended';

  if (remainingSeconds < 600n) {
    const minutes = remainingSeconds / 60n;
    const seconds = remainingSeconds % 60n;
    return `${minutes.toString()}m ${seconds.toString().padStart(2, '0')}s`;
  }

  const totalMinutes = remainingSeconds / 60n;
  const hours = totalMinutes / 60n;
  const minutes = totalMinutes % 60n;

  if (hours > 0n) return `${hours.toString()}h ${minutes.toString().padStart(2, '0')}m`;
  return `${minutes.toString()}m`;
}

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
      winner: Address;
      currentWinner: Address;
      playerATotalUsd: bigint | null;
      playerBTotalUsd: bigint | null;
      buyIn: bigint;
      duration: bigint;
      endTs: bigint;
      status: number;
      tokensAllowed: number[];
    }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOngoingMatchId, setSelectedOngoingMatchId] = useState<bigint | null>(null);
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000));

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
  const { data: platformFeeData } = useReadContract({
    address: hyperDuelContractAddress,
    abi: hyperDuelAbi,
    functionName: 'platformFee',
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
  const platformFeeBps = (platformFeeData as bigint | undefined) ?? 0n;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTs(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

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
              winner: match[2],
              currentWinner,
              playerATotalUsd,
              playerBTotalUsd,
              buyIn: match[3],
              duration: match[4],
              endTs: match[5],
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

  const ongoingMatches = useMemo(
    () => matches.filter((match) => match.status === 1).sort((a, b) => Number(b.id - a.id)),
    [matches],
  );
  const toStartMatches = useMemo(
    () => matches.filter((match) => match.status === 0).sort((a, b) => Number(b.id - a.id)),
    [matches],
  );
  const historyMatches = useMemo(
    () => matches.filter((match) => match.status === 2 || match.status === 3).sort((a, b) => Number(b.id - a.id)),
    [matches],
  );

  useEffect(() => {
    if (ongoingMatches.length === 0) {
      if (selectedOngoingMatchId !== null) setSelectedOngoingMatchId(null);
      return;
    }

    const hasSelected = selectedOngoingMatchId !== null && ongoingMatches.some((match) => match.id === selectedOngoingMatchId);
    if (!hasSelected) {
      setSelectedOngoingMatchId(ongoingMatches[0].id);
    }
  }, [ongoingMatches, selectedOngoingMatchId]);

  const selectedOngoingMatch =
    selectedOngoingMatchId === null ? null : ongoingMatches.find((match) => match.id === selectedOngoingMatchId) ?? null;
  const portfolioTokenIds = useMemo(
    () => (selectedOngoingMatch ? [0, ...selectedOngoingMatch.tokensAllowed] : []),
    [selectedOngoingMatch],
  );
  const { data: playerAPortfolioBalancesData, isLoading: isLoadingPlayerAPortfolio } = useReadContracts({
    contracts:
      hyperDuelContractAddress && selectedOngoingMatch
        ? portfolioTokenIds.map((tokenId) => ({
            address: hyperDuelContractAddress,
            abi: hyperDuelAbi,
            functionName: 'matchBalances',
            args: [selectedOngoingMatch.playerA, selectedOngoingMatch.id, BigInt(tokenId)],
          }))
        : [],
    query: {
      enabled: Boolean(hyperDuelContractAddress && selectedOngoingMatch),
    },
  });
  const { data: playerBPortfolioBalancesData, isLoading: isLoadingPlayerBPortfolio } = useReadContracts({
    contracts:
      hyperDuelContractAddress && selectedOngoingMatch
        ? portfolioTokenIds.map((tokenId) => ({
            address: hyperDuelContractAddress,
            abi: hyperDuelAbi,
            functionName: 'matchBalances',
            args: [selectedOngoingMatch.playerB, selectedOngoingMatch.id, BigInt(tokenId)],
          }))
        : [],
    query: {
      enabled: Boolean(hyperDuelContractAddress && selectedOngoingMatch),
    },
  });
  const { data: portfolioTokenPricesData, isLoading: isLoadingPortfolioPrices } = useReadContracts({
    contracts:
      hyperDuelContractAddress && selectedOngoingMatch
        ? selectedOngoingMatch.tokensAllowed.map((tokenId) => ({
            address: hyperDuelContractAddress,
            abi: hyperDuelAbi,
            functionName: 'tokenPx',
            args: [tokenId],
          }))
        : [],
    query: {
      enabled: Boolean(hyperDuelContractAddress && selectedOngoingMatch),
    },
  });
  const formatCurrentUsd = (value: bigint | null) => {
    if (value === null) return '...';
    const numeric = Number(formatUnits(value, 18));
    if (!Number.isFinite(numeric)) return compactNumber(formatUnits(value, 18));
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  };
  const getCurrentMatchUsdLabels = (match: (typeof matches)[number]) => {
    const connectedAddress = address?.toLowerCase();
    if (connectedAddress && match.playerA.toLowerCase() === connectedAddress) {
      return {
        youUsd: formatCurrentUsd(match.playerATotalUsd),
        otherUsd: formatCurrentUsd(match.playerBTotalUsd),
      };
    }
    if (connectedAddress && match.playerB.toLowerCase() === connectedAddress) {
      return {
        youUsd: formatCurrentUsd(match.playerBTotalUsd),
        otherUsd: formatCurrentUsd(match.playerATotalUsd),
      };
    }
    return {
      youUsd: formatCurrentUsd(match.playerATotalUsd),
      otherUsd: formatCurrentUsd(match.playerBTotalUsd),
    };
  };
  const getCurrentMatchCountdown = (match: (typeof matches)[number]) =>
    formatMatchCountdown(match.endTs - BigInt(nowTs));
  const formatTokenUsdValue = (value: bigint | null) => {
    if (value === null) return '-';
    const numeric = Number(formatUnits(value, 18));
    if (!Number.isFinite(numeric)) return `$${compactNumber(formatUnits(value, 18))}`;
    return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric)}`;
  };
  const getNetPrizeLabel = (match: (typeof matches)[number]) => {
    const grossPrize = match.buyIn * 2n;
    const feeAmount = (grossPrize * platformFeeBps) / platformFeeBase;
    const netPrize = grossPrize - feeAmount;
    return `${compactNumber(formatUnits(netPrize, buyInTokenDecimals))} ${buyInTokenSymbol}`;
  };
  const portfolioTokenPriceById = useMemo(() => {
    const map: Record<number, bigint> = { 0: usdVirtualPriceScale };
    if (!selectedOngoingMatch) return map;
    selectedOngoingMatch.tokensAllowed.forEach((tokenId, index) => {
      const rawPrice = portfolioTokenPricesData?.[index]?.result;
      if (typeof rawPrice === 'bigint') {
        map[tokenId] = rawPrice;
      } else if (typeof rawPrice === 'number' && Number.isFinite(rawPrice)) {
        map[tokenId] = BigInt(rawPrice);
      }
    });
    return map;
  }, [portfolioTokenPricesData, selectedOngoingMatch]);
  const portfolioRows = useMemo(() => {
    if (!selectedOngoingMatch) return [];
    return portfolioTokenIds
      .map((tokenId, index) => {
        const rawPlayerABalance = playerAPortfolioBalancesData?.[index]?.result;
        const rawPlayerBBalance = playerBPortfolioBalancesData?.[index]?.result;
        const playerABalance =
          typeof rawPlayerABalance === 'bigint'
            ? rawPlayerABalance
            : typeof rawPlayerABalance === 'number' && Number.isFinite(rawPlayerABalance)
              ? BigInt(rawPlayerABalance)
              : 0n;
        const playerBBalance =
          typeof rawPlayerBBalance === 'bigint'
            ? rawPlayerBBalance
            : typeof rawPlayerBBalance === 'number' && Number.isFinite(rawPlayerBBalance)
              ? BigInt(rawPlayerBBalance)
              : 0n;
        const tokenPrice = portfolioTokenPriceById[tokenId] ?? null;
        const playerAUsdValue = tokenPrice === null ? null : (playerABalance * tokenPrice) / usdVirtualPriceScale;
        const playerBUsdValue = tokenPrice === null ? null : (playerBBalance * tokenPrice) / usdVirtualPriceScale;
        return {
          tokenId,
          tokenLabel: tokenId === 0 ? 'USD' : tokenLabelById[tokenId] ?? `T${tokenId}`,
          playerABalance,
          playerBBalance,
          playerAUsdValue,
          playerBUsdValue,
        };
      })
      .filter((row) => row.playerABalance > 0n || row.playerBBalance > 0n);
  }, [
    playerAPortfolioBalancesData,
    playerBPortfolioBalancesData,
    portfolioTokenIds,
    portfolioTokenPriceById,
    selectedOngoingMatch,
    tokenLabelById,
  ]);
  const portfolioTotals = useMemo(() => {
    if (portfolioRows.length === 0) return null;
    return portfolioRows.reduce(
      (accumulator, row) => ({
        playerA: accumulator.playerA + (row.playerAUsdValue ?? 0n),
        playerB: accumulator.playerB + (row.playerBUsdValue ?? 0n),
      }),
      { playerA: 0n, playerB: 0n },
    );
  }, [portfolioRows]);
  const portfolioTotalsByRole = useMemo(() => {
    if (!portfolioTotals || !selectedOngoingMatch || !address) return null;
    const connected = address.toLowerCase();
    if (selectedOngoingMatch.playerA.toLowerCase() === connected) {
      return { you: portfolioTotals.playerA, other: portfolioTotals.playerB };
    }
    if (selectedOngoingMatch.playerB.toLowerCase() === connected) {
      return { you: portfolioTotals.playerB, other: portfolioTotals.playerA };
    }
    return { you: portfolioTotals.playerA, other: portfolioTotals.playerB };
  }, [address, portfolioTotals, selectedOngoingMatch]);
  const isYouLeading =
    portfolioTotalsByRole !== null && portfolioTotalsByRole.you > portfolioTotalsByRole.other;
  const isOtherLeading =
    portfolioTotalsByRole !== null && portfolioTotalsByRole.other > portfolioTotalsByRole.you;
  const getTokenAvatarUrl = (tokenLabel: string) => tokenAvatarUrlByLabel[tokenLabel] ?? null;
  const isYouPlayerA = selectedOngoingMatch?.playerA.toLowerCase() === address?.toLowerCase();
  const tokenSliceColors = ['#8f83ff', '#60a5fa', '#34d399', '#f59e0b', '#ef4444', '#14b8a6', '#a78bfa', '#f472b6'];
  const buildComposition = (role: 'you' | 'other') => {
    const entries = portfolioRows
      .map((row, index) => {
        const usdValue =
          role === 'you'
            ? isYouPlayerA
              ? (row.playerAUsdValue ?? 0n)
              : (row.playerBUsdValue ?? 0n)
            : isYouPlayerA
              ? (row.playerBUsdValue ?? 0n)
              : (row.playerAUsdValue ?? 0n);
        return {
          tokenId: row.tokenId,
          tokenLabel: row.tokenLabel,
          usdValue,
          color: tokenSliceColors[index % tokenSliceColors.length],
        };
      })
      .filter((entry) => entry.usdValue > 0n);

    const totalUsd = entries.reduce((accumulator, entry) => accumulator + entry.usdValue, 0n);
    if (totalUsd === 0n) return { totalUsd, slices: [] as Array<(typeof entries)[number] & { percentage: number }> };

    return {
      totalUsd,
      slices: entries.map((entry) => ({
        ...entry,
        percentage: Number((entry.usdValue * 10_000n) / totalUsd) / 100,
      })),
    };
  };
  const youComposition = useMemo(() => buildComposition('you'), [portfolioRows, isYouPlayerA]);
  const otherComposition = useMemo(() => buildComposition('other'), [portfolioRows, isYouPlayerA]);
  const buildConicGradient = (slices: Array<{ color: string; percentage: number }>) => {
    if (slices.length === 0) return '#e5e5e5';
    let start = 0;
    const stops = slices.map((slice) => {
      const end = start + slice.percentage;
      const segment = `${slice.color} ${start}% ${end}%`;
      start = end;
      return segment;
    });
    return `conic-gradient(${stops.join(', ')})`;
  };

  const getStatusLabel = (status: number) => (status === 0 ? 'To Start' : status === 1 ? 'Ongoing' : status === 3 ? 'Cancelled' : 'Finished');
  const getWinnerLabel = (match: (typeof matches)[number]) => {
    if (match.status === 2) {
      return match.winner.toLowerCase() === zeroAddress ? 'Tie' : formatAddress(match.winner);
    }
    if (match.status === 1) {
      return match.currentWinner.toLowerCase() === zeroAddress ? 'Undecided' : formatAddress(match.currentWinner);
    }
    return '-';
  };

  if (!isConnected || !address) {
    return (
      <section className="space-y-6 text-[#2f2f2f]">
        <section className="border border-[#a8a8a8] bg-[#f4f4f4]">
          <div className="border-b border-[#bcbcbc] bg-[#ebebeb] px-4 py-3 md:px-6">
            <div className="font-mono text-lg font-black uppercase tracking-[0.08em] text-[#363636]">
              My Matches
            </div>
          </div>
          <div className="px-4 py-4 md:px-6 md:py-6 font-mono text-sm font-black uppercase tracking-[0.08em] text-[#9a4f4f]">
            Connect your wallet to see matches you joined.
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="space-y-6 text-[#2f2f2f]">
      <section className="border border-[#a8a8a8] bg-[#f1f1f1]">
        <div className="h-1 w-full bg-[linear-gradient(90deg,#8f83ff_0%,#7ed8ff_50%,#8f83ff_100%)]" />
        <div className="px-4 py-6 md:px-8 md:py-7">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex border border-[#9d9d9d] bg-[#e7e7e7] px-3 py-1 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#525252]">
              My Matches
            </div>
            <h1 className="font-mono text-3xl font-black uppercase tracking-[0.06em] text-[#2b2b2b] md:text-5xl">
            Track And Manage Your Matches
            </h1>
            <p className="font-mono text-sm font-bold leading-6 text-[#4d4d4d] md:text-base">
              Review all matches where you are subscribed and manage live swaps during ongoing battles.
            </p>
          </div>
        </div>
      </section>

      <section className="border border-[#a8a8a8] bg-[#f4f4f4]">
        <div className="border-b border-[#bcbcbc] bg-[#ebebeb] px-4 py-3 md:px-6">
          <div className="font-mono text-lg font-black uppercase tracking-[0.08em] text-[#363636]">
            Current Matches
          </div>
        </div>
        <div className="space-y-4 px-4 py-4 md:px-6 md:py-6">
          {error ? (
            <div className="border border-[#d4a2a2] bg-[#f8e6e6] px-4 py-3 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#8a4747]">
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <div className="font-mono text-sm font-black uppercase tracking-[0.08em] text-[#5a5a5a]">Loading your matches...</div>
          ) : ongoingMatches.length === 0 || !selectedOngoingMatch ? (
            <div className="font-mono text-sm font-black uppercase tracking-[0.08em] text-[#6b6b6b]">
              No ongoing matches right now.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border border-[#b9b9b9] bg-[#f9f9f9] px-3 py-3">
                <div className="mb-2 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5a5a5a]">
                  Switch Current Match
                </div>
                <select
                  className="w-full border border-[#b9b9b9] bg-[#f8f8f8] px-3 py-2 font-mono text-xs font-black tracking-[0.04em] text-[#4a4a4a] outline-none focus:border-[#8f83ff]"
                  value={selectedOngoingMatch?.id.toString() ?? ''}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (!nextValue) return;
                    setSelectedOngoingMatchId(BigInt(nextValue));
                  }}
                >
                  {ongoingMatches.map((match) => (
                    <option key={`current-match-option-${match.id.toString()}`} value={match.id.toString()}>
                      {`#${match.id.toString()} | YOU ${getCurrentMatchUsdLabels(match).youUsd} USD | Other player ${getCurrentMatchUsdLabels(match).otherUsd} USD | Countdown ${getCurrentMatchCountdown(match)}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border border-[#b9b9b9] bg-[#f9f9f9] px-4 py-4">
                <div className="grid gap-3 font-mono text-sm font-bold text-[#454545] md:grid-cols-2">
                  <div><span className="text-[#666]">Match:</span> #{selectedOngoingMatch.id.toString()}</div>
                  <div><span className="text-[#666]">Status:</span> Ongoing</div>
                  <div className="md:col-span-2">
                    <span className="text-[#666]">Assets:</span>{' '}
                    {selectedOngoingMatch.tokensAllowed.length > 0
                      ? selectedOngoingMatch.tokensAllowed.map((tokenId) => tokenLabelById[tokenId] ?? `T${tokenId}`).join(' • ')
                      : 'No assets'}
                  </div>
                  <div>
                    <span className="text-[#666]">Current Winner:</span>{' '}
                    {selectedOngoingMatch.currentWinner.toLowerCase() === zeroAddress ? 'Undecided' : formatAddress(selectedOngoingMatch.currentWinner)}
                  </div>
                  <div>
                    <span className="text-[#666]">YOU:</span>{' '}
                    {getCurrentMatchUsdLabels(selectedOngoingMatch).youUsd} USD
                  </div>
                  <div>
                    <span className="text-[#666]">Other player:</span>{' '}
                    {getCurrentMatchUsdLabels(selectedOngoingMatch).otherUsd} USD
                  </div>
                  <div>
                    <span className="text-[#666]">Players:</span>{' '}
                    {selectedOngoingMatch.playerA.toLowerCase() === address.toLowerCase()
                      ? `You vs ${selectedOngoingMatch.playerB.toLowerCase() === zeroAddress ? 'Waiting opponent' : formatAddress(selectedOngoingMatch.playerB)}`
                      : selectedOngoingMatch.playerB.toLowerCase() === address.toLowerCase()
                        ? `${selectedOngoingMatch.playerA.toLowerCase() === zeroAddress ? 'Waiting opponent' : formatAddress(selectedOngoingMatch.playerA)} vs You`
                        : `${formatAddress(selectedOngoingMatch.playerA)} vs ${formatAddress(selectedOngoingMatch.playerB)}`}
                  </div>
                  <div>
                    <span className="text-[#666]">Buy-in:</span>{' '}
                    {compactNumber(formatUnits(selectedOngoingMatch.buyIn, buyInTokenDecimals))} {buyInTokenSymbol}
                  </div>
                  <div><span className="text-[#666]">Duration:</span> {formatDurationFromSeconds(selectedOngoingMatch.duration)}</div>
                  <div>
                    <span className="text-[#666]">Prize (Net):</span> {getNetPrizeLabel(selectedOngoingMatch)}
                  </div>
                  <div>
                    <span className="text-[#666]">Countdown:</span> {getCurrentMatchCountdown(selectedOngoingMatch)}
                  </div>
                </div>

                <div className="mt-4 space-y-4 border-t border-[#d1d1d1] pt-4">
                  <div className="border border-[#b9b9b9] bg-[#f3f3f3] px-3 py-3">
                    {isLoadingPlayerAPortfolio || isLoadingPlayerBPortfolio || isLoadingPortfolioPrices ? (
                      <div className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#666]">Loading portfolio...</div>
                    ) : portfolioRows.length === 0 ? (
                      <div className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#666]">No token balances to display.</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div
                            className={`border px-3 py-3 ${
                              isYouLeading
                                ? 'border-[#8f83ff] bg-[#e9e2ff]'
                                : 'border-[#b8b2ff] bg-[#f0ecff]'
                            }`}
                          >
                            <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#5a4fb0]">
                              YOU {isYouLeading ? '• LEADING' : ''}
                            </div>
                            <div className="mt-1 font-mono text-xl font-black text-[#2f2f2f]">
                              {formatTokenUsdValue(portfolioTotalsByRole?.you ?? null)}
                            </div>
                          </div>
                          <div
                            className={`border px-3 py-3 ${
                              isOtherLeading
                                ? 'border-[#7ca7ff] bg-[#e8f1ff]'
                                : 'border-[#b9b9b9] bg-[#efefef]'
                            }`}
                          >
                            <div className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#5d5d5d]">
                              OTHER PLAYER {isOtherLeading ? '• LEADING' : ''}
                            </div>
                            <div className="mt-1 font-mono text-xl font-black text-[#2f2f2f]">
                              {formatTokenUsdValue(portfolioTotalsByRole?.other ?? null)}
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="border border-[#c2c2c2] bg-[#f9f9f9] px-3 py-3">
                            <div className="mb-2 font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#5a4fb0]">
                              Your Portfolio
                            </div>
                            <div className="flex items-center gap-3">
                              <div
                                className="relative h-24 w-24 rounded-full border border-[#b9b9b9]"
                                style={{ background: buildConicGradient(youComposition.slices) }}
                              >
                                <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c8c8c8] bg-[#f9f9f9]" />
                              </div>
                              <div className="min-w-0 flex-1 space-y-1">
                                {youComposition.slices.length === 0 ? (
                                  <div className="font-mono text-xs font-bold text-[#666]">No allocation data</div>
                                ) : (
                                  youComposition.slices.map((slice) => {
                                    const avatarUrl = getTokenAvatarUrl(slice.tokenLabel);
                                    return (
                                      <div key={`you-composition-${slice.tokenId}`} className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 font-mono text-[11px] font-black text-[#4d4d4d]">
                                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: slice.color }} />
                                          <span className="inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border border-[#9a9a9a] bg-[#f3f3f3]">
                                            {avatarUrl ? (
                                              <img src={avatarUrl} alt={`${slice.tokenLabel} logo`} className="h-full w-full object-cover" loading="lazy" />
                                            ) : (
                                              <span className="text-[8px] font-black text-[#555]">{slice.tokenLabel.slice(0, 3)}</span>
                                            )}
                                          </span>
                                          {slice.tokenLabel}
                                        </div>
                                        <div className="text-right font-mono text-[11px] font-bold text-[#5b5b5b]">
                                          {slice.percentage.toFixed(1)}% · {formatTokenUsdValue(slice.usdValue)}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="border border-[#c2c2c2] bg-[#f9f9f9] px-3 py-3">
                            <div className="mb-2 font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#5d5d5d]">
                              Other Portfolio
                            </div>
                            <div className="flex items-center gap-3">
                              <div
                                className="relative h-24 w-24 rounded-full border border-[#b9b9b9]"
                                style={{ background: buildConicGradient(otherComposition.slices) }}
                              >
                                <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c8c8c8] bg-[#f9f9f9]" />
                              </div>
                              <div className="min-w-0 flex-1 space-y-1">
                                {otherComposition.slices.length === 0 ? (
                                  <div className="font-mono text-xs font-bold text-[#666]">No allocation data</div>
                                ) : (
                                  otherComposition.slices.map((slice) => {
                                    const avatarUrl = getTokenAvatarUrl(slice.tokenLabel);
                                    return (
                                      <div key={`other-composition-${slice.tokenId}`} className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 font-mono text-[11px] font-black text-[#4d4d4d]">
                                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: slice.color }} />
                                          <span className="inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border border-[#9a9a9a] bg-[#f3f3f3]">
                                            {avatarUrl ? (
                                              <img src={avatarUrl} alt={`${slice.tokenLabel} logo`} className="h-full w-full object-cover" loading="lazy" />
                                            ) : (
                                              <span className="text-[8px] font-black text-[#555]">{slice.tokenLabel.slice(0, 3)}</span>
                                            )}
                                          </span>
                                          {slice.tokenLabel}
                                        </div>
                                        <div className="text-right font-mono text-[11px] font-bold text-[#5b5b5b]">
                                          {slice.percentage.toFixed(1)}% · {formatTokenUsdValue(slice.usdValue)}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-3 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5a5a5a]">
                      Swap
                    </div>
                    <SwapPanel
                      matchId={selectedOngoingMatch.id}
                      playerA={selectedOngoingMatch.playerA}
                      playerB={selectedOngoingMatch.playerB}
                      buyIn={selectedOngoingMatch.buyIn}
                      buyInTokenSymbol={buyInTokenSymbol}
                      buyInTokenDecimals={buyInTokenDecimals}
                      tokensAllowed={selectedOngoingMatch.tokensAllowed}
                      tokenLabelById={tokenLabelById}
                      hyperDuelContractAddress={hyperDuelContractAddress}
                      showMatchDetails={false}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="border border-[#a8a8a8] bg-[#f4f4f4]">
        <div className="border-b border-[#bcbcbc] bg-[#ebebeb] px-4 py-3 md:px-6">
          <div className="font-mono text-lg font-black uppercase tracking-[0.08em] text-[#363636]">
            Matches To Start
          </div>
        </div>
        <div className="space-y-4 px-4 py-4 md:px-6 md:py-6">
          {isLoading ? (
            <div className="font-mono text-sm font-black uppercase tracking-[0.08em] text-[#5a5a5a]">Loading your matches...</div>
          ) : toStartMatches.length === 0 ? (
            <div className="font-mono text-sm font-black uppercase tracking-[0.08em] text-[#6b6b6b]">No matches waiting for opponent.</div>
          ) : (
            <div className="overflow-hidden border border-[#b8b8b8] bg-[#f9f9f9]">
              <div className="hidden grid-cols-[0.9fr_1.3fr_1.8fr_1fr_1fr] gap-4 border-b border-[#cfcfcf] bg-[#eeeeee] px-4 py-3 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5a5a5a] md:grid">
                <div>Match</div>
                <div>Players</div>
                <div>Assets</div>
                <div>Buy-In</div>
                <div>Duration</div>
              </div>
              <div className="divide-y divide-[#d3d3d3]">
                {toStartMatches.map((match) => (
                  <div
                    key={`to-start-match-${match.id.toString()}`}
                    className="grid gap-4 bg-[#f9f9f9] px-4 py-4 font-mono text-sm font-bold text-[#3b3b3b] md:grid-cols-[0.9fr_1.3fr_1.8fr_1fr_1fr] md:items-center"
                  >
                    <div>#{match.id.toString()}</div>
                    <div>{`${formatAddress(match.playerA)} vs ${match.playerB.toLowerCase() === zeroAddress ? 'Waiting opponent' : formatAddress(match.playerB)}`}</div>
                    <div>
                      {match.tokensAllowed.length > 0
                        ? match.tokensAllowed.map((tokenId) => tokenLabelById[tokenId] ?? `T${tokenId}`).join(' • ')
                        : 'No assets'}
                    </div>
                    <div>{compactNumber(formatUnits(match.buyIn, buyInTokenDecimals))} {buyInTokenSymbol}</div>
                    <div>{formatDurationFromSeconds(match.duration)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="border border-[#a8a8a8] bg-[#f4f4f4]">
        <div className="border-b border-[#bcbcbc] bg-[#ebebeb] px-4 py-3 md:px-6">
          <div className="font-mono text-lg font-black uppercase tracking-[0.08em] text-[#363636]">
            Match History
          </div>
        </div>
        <div className="space-y-4 px-4 py-4 md:px-6 md:py-6">
          {isLoading ? (
            <div className="font-mono text-sm font-black uppercase tracking-[0.08em] text-[#5a5a5a]">Loading your matches...</div>
          ) : historyMatches.length === 0 ? (
            <div className="font-mono text-sm font-black uppercase tracking-[0.08em] text-[#6b6b6b]">No concluded matches yet.</div>
          ) : (
            <div className="overflow-hidden border border-[#b8b8b8] bg-[#f9f9f9]">
              <div className="hidden grid-cols-[0.9fr_0.8fr_1.3fr_1.6fr_1fr_1fr_1fr] gap-4 border-b border-[#cfcfcf] bg-[#eeeeee] px-4 py-3 font-mono text-xs font-black uppercase tracking-[0.08em] text-[#5a5a5a] md:grid">
                <div>Match</div>
                <div>Status</div>
                <div>Players</div>
                <div>Assets</div>
                <div>Buy-In</div>
                <div>Duration</div>
                <div>Winner</div>
              </div>
              <div className="divide-y divide-[#d3d3d3]">
                {historyMatches.map((match) => (
                  <div
                    key={`history-match-${match.id.toString()}`}
                    className="grid gap-4 bg-[#f9f9f9] px-4 py-4 font-mono text-sm font-bold text-[#3b3b3b] md:grid-cols-[0.9fr_0.8fr_1.3fr_1.6fr_1fr_1fr_1fr] md:items-center"
                  >
                    <div>#{match.id.toString()}</div>
                    <div>{getStatusLabel(match.status)}</div>
                    <div>{`${formatAddress(match.playerA)} vs ${formatAddress(match.playerB)}`}</div>
                    <div>
                      {match.tokensAllowed.length > 0
                        ? match.tokensAllowed.map((tokenId) => tokenLabelById[tokenId] ?? `T${tokenId}`).join(' • ')
                        : 'No assets'}
                    </div>
                    <div>{compactNumber(formatUnits(match.buyIn, buyInTokenDecimals))} {buyInTokenSymbol}</div>
                    <div>{formatDurationFromSeconds(match.duration)}</div>
                    <div>{getWinnerLabel(match)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
