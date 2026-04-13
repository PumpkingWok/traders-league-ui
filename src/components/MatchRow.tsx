import { PixelButton } from './pixel';
import { type Match } from '../types/match';

export function MatchRow({ match, onJoin }: { match: Match; onJoin: () => void }) {
  const canJoin = match.statusCode === 0;

  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-4 font-mono text-sm font-black text-white md:grid-cols-[120px_1.2fr_140px_140px_100px_120px_160px_110px] md:items-center">
      <div>{match.id}</div>
      <div>{match.assets}</div>
      <div>{match.buyIn}</div>
      <div>{match.duration}</div>
      <div>{match.players}</div>
      <div>
        <span className="match-status-pill">{match.status}</span>
      </div>
      <div>{match.winner}</div>
      <div>
        <PixelButton variant="blue" className="w-full text-sm md:w-auto" onClick={onJoin} disabled={!canJoin}>
          Join
        </PixelButton>
      </div>
    </div>
  );
}
