import type { Doc } from '@vtt/core';
import type { JournalPage } from '@vtt/shared';
import { z } from 'zod';
import type { McpTool } from './mcp-protocol.ts';
import { act, look, outcome } from './mcp-seat.ts';
import type { BridgeTable } from './mcp-tools.ts';

// Claude's session recaps: the server keeps each evening's log as a journal
// entry with `session` (play/session-log.ts); Claude reads one and writes a
// short "Previously on..." page at its top. Both go through the caller's
// seat, so only whoever may read and change the entry (the GM, until it is
// shared) can.

const RECAP = 'recap';
const EVENTS = 'events';

interface SessionDoc {
  id: string;
  name: string;
  session: { start: number; end: number };
  pages: JournalPage[];
  rev: number;
}

const game = z.string().optional().describe('The game id (from list_games); leave out for your default game.');

const isSession = (d: Doc): d is Doc & SessionDoc => typeof d.session === 'object' && d.session !== null;
const textOf = (s: SessionDoc, page: string) => s.pages.find((p) => p.id === page)?.text;

/** The sessions the seat may read, newest first. */
async function sessionsOf(table: BridgeTable, id?: string): Promise<SessionDoc[]> {
  const { game, player } = await table.seat(id);
  const docs = (await look(game, player)).docs?.journals ?? [];
  return docs.filter(isSession).toSorted((a, b) => b.session.start - a.session.start);
}

function pick(sessions: SessionDoc[], id?: string): SessionDoc {
  const found = id ? sessions.find((s) => s.id === id) : sessions[0];
  if (!found) throw new Error(id ? `No session ${id}` : 'No session has been logged yet');
  return found;
}

function reading(sessions: SessionDoc[], s: SessionDoc) {
  const earlier = sessions.filter((o) => o.session.start < s.session.start);
  const events = textOf(s, EVENTS);
  return {
    id: s.id,
    name: s.name,
    session: s.session,
    events: events ? events.split('\n') : [],
    recap: textOf(s, RECAP),
    previousRecap: earlier.map((o) => textOf(o, RECAP)).find((t) => t),
    sessions: sessions.map((o) => ({ id: o.id, name: o.name })),
  };
}

/** The entry's pages with the recap first: written over, or added. */
function withRecap(s: SessionDoc, text: string): JournalPage[] {
  const recap: JournalPage = { id: RECAP, name: 'Previously on...', kind: 'text', text };
  return [recap, ...s.pages.filter((p) => p.id !== RECAP)];
}

export function sessionTools(table: BridgeTable): McpTool[] {
  return [
    {
      name: 'read_session',
      description:
        'A session log page the game keeps of an evening of play (fights, kills, loot, levels, quests, places, ' +
        'big rolls), newest unless `session` names one; with its recap, the recap before it, and every session.',
      input: z.object({ game, session: z.string().optional() }),
      run: async (a: { game?: string; session?: string }) => {
        const sessions = await sessionsOf(table, a.game);
        return JSON.stringify(reading(sessions, pick(sessions, a.session)));
      },
    },
    {
      name: 'write_recap',
      description:
        'Writes a short "Previously on..." recap (Markdown, a paragraph or two, in the story\'s voice) as the ' +
        "first page of a session's log entry, replacing any recap there. Read the session first.",
      input: z.object({ game, session: z.string(), text: z.string().min(1).max(4000) }),
      run: async (a: { game?: string; session: string; text: string }) => {
        const s = pick(await sessionsOf(table, a.game), a.session);
        const { game, player } = await table.seat(a.game);
        const op = {
          op: 'update' as const,
          coll: 'journals',
          id: s.id,
          rev: s.rev,
          patch: { pages: withRecap(s, a.text) },
        };
        return outcome(await act(game, player, [{ t: 'ops', txn: 'claude-recap', label: 'recap', ops: [op] }]));
      },
    },
  ];
}
