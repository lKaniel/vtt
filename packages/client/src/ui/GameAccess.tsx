import type { GameDetail } from '@vtt/shared';
import { LockIcon, LockOpenIcon } from 'lucide-react';
import { useState } from 'react';
import { api } from '../account-api.ts';
import { Button } from './kit/button.tsx';
import { Checkbox } from './kit/checkbox.tsx';
import { Input } from './kit/input.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';

// Who gets into a game, on its lobby page (GM only): approving join
// requests, and passwords on the home game's fixed seats.

type Props = Readonly<{ game: GameDetail; onChanged: () => void }>;

/** Joining asks the GM first; the accounts waiting, to let in or turn down. */
export function ApprovalPanel({ game, onChanged }: Props) {
  const [error, setError] = useState<string>();
  const run = async (step: Promise<unknown>) => {
    try {
      await step;
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const requests = game.requests ?? [];
  return (
    <div className="auth frame lobby-form" data-slot="join-approval">
      <h2 className="lobby-heading">Who joins</h2>
      <label className="lobby-check">
        <Checkbox
          checked={game.approval === true}
          onCheckedChange={(on) => void run(api.setApproval(game.id, on === true))}
        />
        Ask me before anyone joins
      </label>
      {requests.length > 0 && (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <span className="grow">{r.name}</span>
              <Button size="sm" onClick={() => void run(api.answerRequest(game.id, r.id, true))}>
                Let in
              </Button>
              <Button variant="outline" size="sm" onClick={() => void run(api.answerRequest(game.id, r.id, false))}>
                Turn down
              </Button>
            </li>
          ))}
        </ul>
      )}
      {game.approval && !requests.length && <p className="menu-note">No one is waiting.</p>}
      {error && <p className="menu-error">{error}</p>}
    </div>
  );
}

/** A password on a seat taken without an account (the home game's fixed seats). */
export function SeatPassword({
  game,
  seat,
  onChanged,
}: Readonly<{ game: GameDetail; seat: GameDetail['players'][number]; onChanged: () => void }>) {
  const [password, setPassword] = useState('');
  const [open, setOpen] = useState(false);
  const save = async (next: string | null) => {
    await api.setSeatPassword(game.id, seat.id, next);
    setPassword('');
    setOpen(false);
    onChanged();
  };
  const label = seat.locked ? `${seat.name}'s seat has a password` : `Put a password on ${seat.name}'s seat`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} title={label}>
          {seat.locked ? <LockIcon /> : <LockOpenIcon />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-[260px] flex-col gap-2" data-slot="seat-password">
        <span className="text-sm">Taking this seat without an account asks for:</span>
        <Input
          type="password"
          aria-label="Seat password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && password && void save(password)}
        />
        <div className="flex gap-2">
          <Button size="sm" disabled={!password} onClick={() => void save(password)}>
            Set password
          </Button>
          {seat.locked && (
            <Button variant="outline" size="sm" onClick={() => void save(null)}>
              Remove it
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** With an admin password on the server, the admin is whoever gives it. */
export function AdminUnlock({ onUnlocked }: Readonly<{ onUnlocked: () => Promise<void> }>) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const unlock = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    try {
      await api.unlockAdmin(password);
      await onUnlocked();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form className="flex items-center gap-2" onSubmit={(e) => void unlock(e)} data-slot="admin-unlock">
      <Input
        type="password"
        aria-label="Admin password"
        placeholder="Admin password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" variant="outline" disabled={!password}>
        Become admin
      </Button>
      {error && <span className="menu-error">{error}</span>}
    </form>
  );
}
