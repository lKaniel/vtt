import type { Doc } from '@vtt/core';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkClick, linkTarget, rollClick } from './content-target.ts';
import type { Session } from '../session/session.ts';
import { closeSession, openSession, token, welcome, type FakeWebSocket } from '../session/session.fixtures.ts';

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

const cave: Doc = { id: 'cave', type: 'scene', rev: 1, name: 'Cave' };
const lore: Doc = { id: 'lore', type: 'journal', rev: 1, name: 'Lore', pages: [] };

function joinAs(role: 'gm' | 'player'): void {
  const base = welcome([{ ...token('hero'), ownership: { default: 'none', ana: 'owner' } }]) as Extract<
    ServerMessage,
    { t: 'welcome' }
  >;
  const you = role === 'gm' ? { id: 'gm', name: 'GM', role, color: '#fc0' } : base.you;
  ws.receive({ ...base, you, docs: { journals: [lore], scenes: [cave] } });
}

const last = () => ws.sent.at(-1) as Record<string, unknown>;

describe('what a link in journal text points at', () => {
  it('opens a journal entry you can read, at its page', () => {
    joinAs('player');
    const target = linkTarget(session, { kind: 'journal', id: 'lore', page: 'p1' });
    expect(target.name).toBe('Lore');
    target.open?.();
    expect(session.journal.current).toEqual({ entry: 'lore', page: 'p1' });
    expect(linkTarget(session, { kind: 'journal', id: 'secret' }).open).toBeUndefined();
  });

  it('shows rules content on hover', () => {
    joinAs('player');
    const fireball = linkTarget(session, { kind: 'spell', id: 'fireball' });
    expect(fireball).toMatchObject({ name: 'Fireball', tip: { title: 'Fireball' } });
    expect(linkTarget(session, { kind: 'monster', id: 'goblin' }).tip?.title).toBe('Goblin');
    expect(linkTarget(session, { kind: 'item', id: 'longsword' }).name).toBe('Longsword');
    expect(linkTarget(session, { kind: 'spell', id: 'nope' })).toEqual({});
  });

  it('lets only the GM go to a scene', () => {
    joinAs('player');
    expect(linkTarget(session, { kind: 'scene', id: 'cave' })).toEqual({ name: 'Cave' });
  });
});

describe('inline rolls and checks', () => {
  it('rolls in chat', () => {
    joinAs('player');
    rollClick(session, '/r 2d6')();
    expect(last()).toEqual({ t: 'chat', text: '/r 2d6' });
  });

  it('rolls a check for your selected creature, or asks the party when the GM clicks', () => {
    joinAs('player');
    expect(checkClick(session, { name: 'luck' })).toBeUndefined();
    session.select('hero');
    checkClick(session, { name: 'perception' })!();
    expect(last()).toEqual({ t: 'rollCheck', token: 'hero', ability: 'wis', skill: 'perception' });
  });

  it('lets the GM ask for an inline check', () => {
    joinAs('gm');
    checkClick(session, { name: 'dex', dc: 12 })!();
    expect(last()).toMatchObject({ t: 'requestCheck', ability: 'dex', kind: 'each', dc: 12 });
  });

  it('lets the GM go to a scene', () => {
    joinAs('gm');
    linkTarget(session, { kind: 'scene', id: 'cave' }).open?.();
    expect(last()).toEqual({ t: 'viewScene', scene: 'cave' });
    expect(linkTarget(session, { kind: 'actor', id: 'nobody' })).toEqual({});
  });
});
