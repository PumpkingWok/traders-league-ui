import { type Match } from '../types/match';

export function MatchRow({
  match,
  onJoin,
  onConclude,
  gridTemplateColumns,
  hideCountdownAndWinner,
}: {
  match: Match;
  onJoin: () => void;
  onConclude: () => void;
  gridTemplateColumns: string;
  hideCountdownAndWinner: boolean;
}) {
  const alreadyJoined = Boolean(match.isJoined);
  const canJoin = match.canJoin ?? (match.statusCode === 0 && !alreadyJoined);
  const canConclude = Boolean(match.canConclude);
  const actionLabel = canConclude
    ? (match.isConcluding ? 'Concluding...' : 'Conclude')
    : match.isReservedForYou
      ? 'Reserved To You'
      : alreadyJoined
        ? 'Joined'
        : match.matchType === 'Reserved' && !canJoin
          ? 'Reserved'
          : 'Join';
  const actionOnClick = canConclude ? onConclude : onJoin;
  const actionDisabled = canConclude ? Boolean(match.isConcluding) : !canJoin;
  const actionClassName = canConclude
    ? 'border-[#8f83ff] bg-[#ece9ff] text-[#433d98] hover:bg-[#e3deff]'
    : canJoin
      ? 'border-[#8f83ff] bg-[#ece9ff] text-[#433d98] hover:bg-[#e3deff]'
      : 'cursor-not-allowed border-[#c8c8c8] bg-[#f1f1f1] text-[#9a9a9a]';

  return (
    <div
      className="grid w-full gap-4 bg-[#f9f9f9] px-4 py-4 font-mono text-sm font-black text-[#3b3b3b] md:items-center"
      style={{ gridTemplateColumns }}
    >
      <div>{match.id}</div>
      <div className="whitespace-nowrap">{match.assets}</div>
      <div className="whitespace-nowrap">{match.buyIn}</div>
      <div className="whitespace-nowrap">{match.prize ?? '-'}</div>
      <div className="whitespace-nowrap">{match.matchType ?? 'Public'}</div>
      <div>{match.duration}</div>
      {!hideCountdownAndWinner ? <div className="tabular-nums">{match.countdown ?? '-'}</div> : null}
      <div>{match.players}</div>
      <div>
        <span className="inline-flex border border-[#b8b8b8] bg-[#efefef] px-2 py-1 font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#5b5b5b]">
          {match.status}
        </span>
      </div>
      {!hideCountdownAndWinner ? <div>{match.winner}</div> : null}
      <div>
        <button
          type="button"
          className={`w-full border px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] md:w-auto ${actionClassName}`}
          onClick={actionOnClick}
          disabled={actionDisabled}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
