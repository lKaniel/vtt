import { srdFor, type Combat, type ServerMessage, type Token } from '@vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Session } from './session.ts';

/** The most recently opened FakeWebSocket. */
let lastSocket: FakeWebSocket | undefined;

/** Stands in for the browser WebSocket. */
class FakeWebSocket {
  static readonly OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  sent: unknown[] = [];
  onmessage?: (e: { data: string }) => void;
  onclose?: (e: { code: number }) => void;

  constructor(readonly url: string) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- tests reach the socket the session opened
    lastSocket = this;
  }

  send(text: string): void {
    this.sent.push(JSON.parse(text));
  }

  close(): void {
    this.readyState = 3;
  }

  receive(msg: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const token = (id: string, x = 50, y = 50): Token => ({
  id,
  name: id,
  x,
  y,
  size: 1,
  color: '#fff',
  speed: 30,
  darkvision: 0,
  controllers: ['ana'],
  hidden: false,
});

function welcome(tokens: Token[] = [token('hero')]): ServerMessage {
  return {
    t: 'welcome',
    world: { name: 'Test', gridSize: 100, chunkSize: 1000, start: [0, 0], darkness: 0, vision: true, rules: '2014' },
    you: { id: 'ana', name: 'Ana', role: 'player', color: '#f00' },
    tokens,
    chat: [],
    combat: null,
  };
}

const fight = (turn: number, move = 30): Combat => ({
  round: 1,
  turn,
  order: [
    { token: 'goblin', initiative: 15 },
    { token: 'hero', initiative: 10 },
  ],
  left: { move, action: true, bonus: true, attacks: 0, used: [] },
  side: {},
});

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal('location', { protocol: 'http:', host: 'table:3000' });
  session = new Session('ana');
  session.connect();
  ws = lastSocket!;
});

afterEach(() => {
  session.close();
  vi.unstubAllGlobals();
});

describe('Session', () => {
  it('joins with the player id and takes the welcome', () => {
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- the page was loaded over http
    expect(ws.url).toBe('ws://table:3000/ws?player=ana');
    ws.receive(welcome());
    expect(session.status).toBe('open');
    expect(session.canControl(session.tokens.get('hero')!)).toBe(true);
  });

  it('keeps only chunks in view', () => {
    const chunk = { tiles: [], walls: [], lights: [] };
    const gone = vi.fn();
    session.on('chunkGone', gone);
    session.setView(['0_0']);
    ws.receive({ t: 'chunk', key: '0_0', chunk });
    ws.receive({ t: 'chunk', key: '5_5', chunk });
    expect([...session.chunks.keys()]).toEqual(['0_0']);
    session.setView(['1_0']);
    expect(gone).toHaveBeenCalledWith('0_0');
    expect(ws.sent.at(-1)).toEqual({ t: 'view', chunks: ['1_0'] });
  });

  it('moves tokens to the end of their path', () => {
    ws.receive(welcome());
    const moved = vi.fn();
    session.on('moved', moved);
    ws.receive({
      t: 'moved',
      id: 'hero',
      path: [
        [50, 50],
        [150, 50],
      ],
    });
    expect(session.tokens.get('hero')).toMatchObject({ x: 150, y: 50 });
    expect(moved).toHaveBeenCalledOnce();
  });

  it('drops the selection when its token disappears', () => {
    ws.receive(welcome());
    session.select('hero');
    ws.receive({ t: 'tokenGone', id: 'hero' });
    expect(session.selected).toBeUndefined();
    expect(session.tokens.size).toBe(0);
  });

  it('collects chat and errors', () => {
    ws.receive(welcome());
    session.say('hello');
    expect(ws.sent.at(-1)).toEqual({ t: 'chat', text: 'hello' });
    ws.receive({ t: 'chat', message: { id: '1', time: 0, from: 'Ana', color: '#f00', text: 'hello' } });
    ws.receive({ t: 'error', message: 'nope' });
    expect(session.chat).toHaveLength(1);
    expect(session.error?.message).toBe('nope');
  });

  it('tells the map about new chat messages, but not the history it joins with', () => {
    const heard = vi.fn();
    session.on('chat', heard);
    const old = { id: '0', time: 0, from: 'Ana', color: '#f00', text: 'earlier' };
    ws.receive({ ...welcome(), chat: [old] } as ServerMessage);
    expect(heard).not.toHaveBeenCalled();
    const fresh = { ...old, id: '1', text: 'now' };
    ws.receive({ t: 'chat', message: fresh });
    expect(heard).toHaveBeenCalledWith(fresh);
  });

  it('asks for its chunks again after reconnecting', () => {
    session.setView(['0_0']);
    ws.receive(welcome());
    expect(ws.sent.at(-1)).toEqual({ t: 'view', chunks: ['0_0'] });
  });

  it('reconnects unless the seat was refused', () => {
    vi.useFakeTimers();
    ws.onclose?.({ code: 1006 });
    expect(session.status).toBe('closed');
    vi.advanceTimersByTime(1000);
    const second = lastSocket!;
    expect(second).not.toBe(ws);
    second.onclose?.({ code: 4001 });
    vi.advanceTimersByTime(1000);
    expect(lastSocket).toBe(second);
    expect(session.error?.message).toMatch(/Unknown player/);
    vi.useRealTimers();
  });

  it('passes focus requests to the map', () => {
    const focus = vi.fn();
    session.on('focus', focus);
    session.focus([10, 20]);
    expect(focus).toHaveBeenCalledWith([10, 20]);
  });

  describe('in combat', () => {
    beforeEach(() => {
      ws.receive(welcome([token('hero'), { ...token('goblin', 150), controllers: [] }]));
    });

    it('knows whose turn it is and how far each token may walk', () => {
      ws.receive({ t: 'combat', combat: fight(0) });
      expect(session.combat?.round).toBe(1);
      expect(session.turnToken()?.id).toBe('goblin');
      expect(session.isMyTurn()).toBe(false);
      expect(session.movementLeft('hero')).toBe(0);
      ws.receive({ t: 'combat', combat: fight(1, 20) });
      expect(session.isMyTurn()).toBe(true);
      expect(session.movementLeft('hero')).toBe(20);
      ws.receive({ t: 'combat', combat: null });
      expect(session.movementLeft('hero')).toBe(Infinity);
    });

    it('selects and finds your creature when its turn starts', () => {
      const focus = vi.fn();
      session.on('focus', focus);
      ws.receive({ t: 'combat', combat: fight(1) });
      expect(session.selected).toBe('hero');
      expect(focus).toHaveBeenCalledWith([50, 50]);
    });

    it('arms an attack, then fires it at the clicked target', () => {
      session.select('hero');
      session.arm('Longsword');
      expect(session.armed).toBe('Longsword');
      session.attack('goblin');
      expect(ws.sent.at(-1)).toEqual({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword' });
      expect(session.armed).toBeUndefined();
    });

    it('drops the armed attack when the selection changes', () => {
      session.select('hero');
      session.arm('Longsword');
      session.select(undefined);
      expect(session.armed).toBeUndefined();
    });

    describe('spells', () => {
      const wizard = () => ({
        ...token('hero'),
        sheet: {
          caster: {
            level: 5,
            spells: [srdFor('2014').spells.get('magic-missile')!, srdFor('2014').spells.get('fireball')!],
          },
        } as never,
      });

      beforeEach(() => {
        ws.receive({ t: 'token', token: wizard() });
        session.select('hero');
      });

      it('aims a spell at creatures and casts once enough are picked', () => {
        session.aim('magic-missile', 1);
        expect(session.aiming).toMatchObject({ need: 3 });
        session.pickTarget('goblin');
        session.pickTarget('goblin');
        expect(ws.sent.at(-1)).not.toMatchObject({ t: 'cast' });
        session.pickTarget('orc');
        expect(ws.sent.at(-1)).toEqual({
          t: 'cast',
          caster: 'hero',
          spell: 'magic-missile',
          slot: 1,
          targets: ['goblin', 'goblin', 'orc'],
        });
        expect(session.aiming).toBeUndefined();
      });

      it('casts with fewer targets on confirm', () => {
        session.aim('magic-missile', 1);
        session.pickTarget('goblin');
        session.confirmCast();
        expect(ws.sent.at(-1)).toMatchObject({ t: 'cast', targets: ['goblin'] });
      });

      it('casts an area spell at the clicked point', () => {
        session.aim('fireball', 3);
        session.castAt([250, 150]);
        expect(ws.sent.at(-1)).toMatchObject({ t: 'cast', spell: 'fireball', point: [250, 150] });
      });

      it('summons what the player chose', () => {
        const familiar = srdFor('2014').spells.get('find-familiar')!;
        ws.receive({
          t: 'token',
          token: { ...wizard(), sheet: { caster: { level: 5, spells: [familiar] } } as never },
        });
        session.aim('find-familiar', 1);
        session.chooseSummon('owl');
        session.castAt([150, 50]);
        expect(ws.sent.at(-1)).toMatchObject({ t: 'cast', spell: 'find-familiar', summon: 'owl', point: [150, 50] });
      });

      it('puts away a readied attack when aiming a spell, and the other way round', () => {
        session.arm('Longsword');
        session.aim('fireball', 3);
        expect(session.armed).toBeUndefined();
        session.arm('Longsword');
        expect(session.aiming).toBeUndefined();
      });
    });

    it('sends features, rests and dropped concentration', () => {
      session.useFeature('hero', 'second-wind');
      expect(ws.sent.at(-1)).toEqual({ t: 'feature', token: 'hero', feature: 'second-wind' });
      session.rest(['hero'], 'long');
      expect(ws.sent.at(-1)).toEqual({ t: 'rest', tokens: ['hero'], kind: 'long' });
      session.dropConcentration('hero');
      expect(ws.sent.at(-1)).toEqual({ t: 'dropConcentration', token: 'hero' });
      session.removeEffect('hero', 'bless-wiz');
      expect(ws.sent.at(-1)).toEqual({ t: 'removeEffect', token: 'hero', effect: 'bless-wiz' });
    });

    it('picks the creatures on screen for a new fight', () => {
      const sheet = { hp: 5, maxHp: 5 } as never;
      ws.receive({ t: 'token', token: { ...token('hero'), sheet } });
      ws.receive({ t: 'token', token: { ...token('goblin', 150), controllers: [], health: 'hurt' } });
      ws.receive({ t: 'token', token: { ...token('far', 5000), health: 'unhurt' } });
      ws.receive({ t: 'token', token: { ...token('lurker', 250), hidden: true, health: 'unhurt' } });
      ws.receive({ t: 'token', token: token('barrel', 350) });
      session.viewRect = { x: 0, y: 0, w: 1000, h: 1000 };
      expect(session.fightersInView()).toEqual(['hero', 'goblin']);
    });

    it('sends turn, combat and equipment requests', () => {
      session.endTurn();
      session.startCombat(['hero', 'goblin']);
      session.endCombat();
      session.equip('hero', 2, true);
      expect(ws.sent.slice(-4)).toEqual([
        { t: 'endTurn' },
        { t: 'combatStart', tokens: ['hero', 'goblin'] },
        { t: 'combatEnd' },
        { t: 'equip', token: 'hero', item: 2, equipped: true },
      ]);
    });
  });
});

describe('the GM tools', () => {
  const gmWelcome = (): ServerMessage => ({
    ...(welcome() as Extract<ServerMessage, { t: 'welcome' }>),
    you: { id: 'gm', name: 'GM', role: 'gm', color: '#fc0' },
    players: [{ id: 'gm', name: 'GM', role: 'gm', color: '#fc0' }],
    actors: [{ ...token('bandit'), folder: 'Road' }],
  });

  it('keeps the Actors list up to date', () => {
    ws.receive(gmWelcome());
    expect([...session.actors.keys()]).toEqual(['bandit']);
    expect(session.players.map((p) => p.id)).toEqual(['gm']);
    ws.receive({ t: 'actor', actor: { ...token('wolf') } });
    ws.receive({ t: 'actorGone', id: 'bandit' });
    expect([...session.actors.keys()]).toEqual(['wolf']);
  });

  it('opens a sheet, switches it to editing, and closes it when the token goes', () => {
    ws.receive(gmWelcome());
    session.openSheet({ kind: 'token', id: 'hero' });
    expect(session.sheet).toEqual({ kind: 'token', id: 'hero', edit: false });
    session.setSheetEdit(true);
    expect(session.sheet?.edit).toBe(true);
    ws.receive({ t: 'tokenGone', id: 'hero' });
    expect(session.sheet).toBeUndefined();
  });

  it('only lets the GM edit a sheet', () => {
    ws.receive(welcome());
    session.openSheet({ kind: 'token', id: 'hero' }, true);
    expect(session.sheet?.edit).toBe(false);
  });

  it('saves a hotbar layout', () => {
    ws.receive(welcome());
    session.setHotbar('hero', ['spell:fire-bolt', null]);
    expect(ws.sent.at(-1)).toEqual({ t: 'hotbar', token: 'hero', slots: ['spell:fire-bolt', null] });
  });

  it('sends drops and shows why one was refused', () => {
    ws.receive(gmWelcome());
    session.spawnHidden = true;
    session.drop({ kind: 'monster', id: 'goblin', rules: '2014' }, [10, 10]);
    expect(ws.sent.at(-1)).toMatchObject({ t: 'spawn', hidden: true });
    session.drop({ kind: 'item', id: 'dagger' }, [900, 900]);
    expect(session.error?.message).toBe('Drop items on a creature');
  });
});

describe('the GM tools send', () => {
  it('edits, deletions, spawns and actors', () => {
    ws.receive(welcome());
    session.editToken('hero', {});
    session.editToken('hero', { hp: 3 });
    session.deleteToken('hero');
    session.setSpawnHidden(false);
    session.spawn({ kind: 'actor', id: 'bandit' }, [5, 5]);
    session.saveActor({ ...token('bandit') });
    session.deleteActor('bandit');
    expect(ws.sent.slice(-5)).toEqual([
      { t: 'editToken', token: 'hero', patch: { hp: 3 } },
      { t: 'deleteToken', token: 'hero' },
      { t: 'spawn', from: { kind: 'actor', id: 'bandit' }, at: [5, 5], hidden: false },
      { t: 'saveActor', actor: token('bandit') },
      { t: 'deleteActor', actor: 'bandit' },
    ]);
  });

  it('places things at the centre of the screen', () => {
    ws.receive(welcome());
    expect(session.viewCentre()).toEqual([0, 0]);
    session.viewRect = { x: 100, y: 200, w: 400, h: 200 };
    expect(session.viewCentre()).toEqual([300, 300]);
  });
});
