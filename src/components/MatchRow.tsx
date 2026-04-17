import { type Match } from '../types/match';

export function MatchRow({
  match,
  onJoin,
  onConclude,
  gridTemplateColumns,
  hideCountdownAndWinner,
  hideStatus,
  hideAction,
}: {
  match: Match;
  onJoin: () => void;
  onConclude: () => void;
  gridTemplateColumns: string;
  hideCountdownAndWinner: boolean;
  hideStatus: boolean;
  hideAction: boolean;
}) {
  const alreadyJoined = Boolean(match.isJoined);
  const canJoin = match.canJoin ?? (match.statusCode === 0 && !alreadyJoined);
  const canConclude = Boolean(match.canConclude);
  const actionLabel = canConclude
    ? (match.isConcluding ? 'Concluding...' : 'Conclude')
    : alreadyJoined
      ? 'Joined'
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
      className="grid w-full gap-4 bg-[#f9f9f9] px-4 py-4 text-center font-mono text-sm font-black text-[#3b3b3b] md:items-center"
      style={{ gridTemplateColumns }}
    >
      <div>{match.id}</div>
      <div className="whitespace-nowrap">{match.assets}</div>
      <div className="whitespace-nowrap">{match.buyIn}</div>
      <div className="whitespace-nowrap">{match.prize ?? '-'}</div>
      <div>{match.duration}</div>
      {!hideCountdownAndWinner ? <div className="tabular-nums">{match.countdown ?? '-'}</div> : null}
      <div>
        {match.playersTooltip ? (
          <span title="" className="group relative inline-block cursor-help">
            <span>{match.players}</span>
            <span title="" className="pointer-events-none invisible absolute left-1/2 top-full z-30 mt-2 w-max max-w-[20rem] -translate-x-1/2 border border-[#b9b9b9] bg-[#ffffff] p-3 text-left font-mono text-[11px] font-bold normal-case tracking-normal text-[#4d4d4d] opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.12)] transition duration-150 group-hover:visible group-hover:opacity-100">
              {match.playersTooltip}
            </span>
          </span>
        ) : (
          match.players
        )}
      </div>
      {!hideStatus ? (
        <div className="flex justify-center">
          <span className="inline-flex border border-[#b8b8b8] bg-[#efefef] px-2 py-1 font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#5b5b5b]">
            {match.status}
          </span>
        </div>
      ) : null}
      {!hideCountdownAndWinner ? (
        <div className="flex items-center justify-center text-center">
          {match.winner}
        </div>
      ) : null}
      {!hideAction ? (
        <div className="flex justify-center">
          <button
            type="button"
            className={`w-full border px-3 py-2 font-mono text-xs font-black uppercase tracking-[0.08em] md:w-auto ${actionClassName}`}
            onClick={actionOnClick}
            disabled={actionDisabled}
          >
            {actionLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
