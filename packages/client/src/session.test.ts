import { type ServerMessage, srdFor } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Session } from './session.ts';
import {
  closeSession,
  latestSocket,
  fight,
  openSession,
  token,
  welcome,
  type FakeWebSocket,
} from './session.fixtures.ts';

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

describe('Session', () => {
  it('joins with the player id and takes the welcome', () => {
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- the page was loaded over http
    expect(ws.url).toBe('ws://table:3000/ws?player=ana');
    ws.receive(welcome());
    expect(session.status).toBe('open');
    expect(session.canControl(session.tokens.get('hero')!)).toBe(true);
  });

  it('tells the server its roll mode on joining and when it changes', () => {
    ws.receive(welcome());
    expect(ws.sent).toContainEqual({ t: 'rollMode', mode: 'public' });
    session.setRollMode('blind');
    expect(session.rollMode).toBe('blind');
    expect(ws.sent.at(-1)).toEqual({ t: 'rollMode', mode: 'blind' });
  });

  it('forgets a target that is gone, and keeps the rest when it starts over', () => {
    ws.receive(welcome([token('hero'), token('goblin'), token('orc')]));
    session.targets.toggle('goblin');
    ws.receive({ t: 'tokenGone', id: 'goblin' });
    expect(session.targets.mine.size).toBe(0);
    session.targets.toggle('hero');
    session.targets.toggle('orc');
    ws.receive(welcome([token('hero')]));
    expect([...session.targets.mine]).toEqual(['hero']);
    expect(ws.sent).toContainEqual({ t: 'target', tokens: ['hero'] });
  });

  it('targets the creature under the pointer with T, and lets them all go over empty ground', () => {
    ws.receive(welcome([token('hero'), token('goblin', 250, 50)]));
    session.pointer = [240, 60];
    expect(session.toggleTargetAtPointer()).toBe(true);
    expect([...session.targets.mine]).toEqual(['goblin']);
    session.pointer = [650, 650];
    expect(session.toggleTargetAtPointer()).toBe(true);
    expect(session.targets.mine.size).toBe(0);
    expect(session.toggleTargetAtPointer()).toBe(false);
  });

  it('follows the time of day without reconnecting', () => {
    ws.receive(welcome());
    const lit = vi.fn();
    session.on('lighting', lit);
    ws.receive({ t: 'lighting', darkness: 0.7 });
    expect(session.world?.darkness).toBeCloseTo(0.7);
    expect(lit).toHaveBeenCalled();
  });

  it('sends map edits, darkness, and keeps the light preset', () => {
    ws.receive(welcome());
    session.editMap({ op: 'remove', chunk: '0_0', id: 'w' });
    expect(ws.sent.at(-1)).toEqual({ t: 'mapEdit', edit: { op: 'remove', chunk: '0_0', id: 'w' } });
    session.setLightPreset('campfire');
    expect(session.lightPreset).toBe('campfire');
    session.setDarkness(0.4);
    expect(ws.sent.at(-1)).toEqual({ t: 'darkness', darkness: 0.4 });
  });

  it('lays your ruler for the table and shows the others’ until a fresh welcome', () => {
    ws.receive(welcome());
    const shown = vi.fn();
    session.on('rulers', shown);
    session.rulers.press([10, 20]);
    expect(ws.sent.at(-1)).toEqual({ t: 'ruler', points: [[10, 20]] });
    ws.receive({
      t: 'ruler',
      player: 'bo',
      name: 'Bo',
      color: '#00f',
      points: [
        [0, 0],
        [5, 5],
      ],
    });
    expect(session.rulers.others.get('bo')?.name).toBe('Bo');
    expect(shown).toHaveBeenCalled();
    ws.receive(welcome());
    expect(session.rulers.others.size).toBe(0);
    expect(session.rulers.active).toBe(false);
  });

  it('shows the others’ cursors and pings, and a GM’s pull brings your view to the spot', () => {
    ws.receive(welcome());
    const shown = vi.fn();
    const focus = vi.fn();
    session.on('presence', shown);
    session.on('focus', focus);
    const bo = { player: 'bo', name: 'Bo', color: '#00f' };
    ws.receive({ t: 'cursor', ...bo, at: [3, 4] });
    expect(session.presence.cursors.get('bo')?.at).toEqual([3, 4]);
    ws.receive({ t: 'ping', ...bo, at: [8, 8], pull: true });
    expect(focus).toHaveBeenCalledWith([8, 8]);
    expect(shown).toHaveBeenCalledTimes(2);
    session.presence.ping([1, 2], false);
    expect(ws.sent.at(-1)).toEqual({ t: 'ping', at: [1, 2] });
    ws.receive(welcome());
    expect(session.presence.cursors.size).toBe(0);
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
    expect(ws.sent).toContainEqual({ t: 'view', chunks: ['0_0'] });
  });

  it('reconnects unless the seat was refused', () => {
    vi.useFakeTimers();
    ws.onclose?.({ code: 1006 });
    expect(session.status).toBe('closed');
    vi.advanceTimersByTime(1000);
    const second = latestSocket()!;
    expect(second).not.toBe(ws);
    second.onclose?.({ code: 4001 });
    vi.advanceTimersByTime(1000);
    expect(latestSocket()).toBe(second);
    expect(session.error?.message).toMatch(/no seat/);
    vi.useRealTimers();
  });

  it('joins as the signed-in account when no seat is given', () => {
    const own = new Session();
    own.connect();
    expect(latestSocket()!.url).toMatch(/\/ws$/);
    own.close();
  });

  it('joins the game it was opened for', () => {
    const own = new Session(undefined, 'lost-mine');
    own.connect();
    expect(latestSocket()!.url).toMatch(/\/ws\?game=lost-mine$/);
    own.close();
  });

  it('passes focus requests to the map', () => {
    const focus = vi.fn();
    session.on('focus', focus);
    session.focus([10, 20]);
    expect(focus).toHaveBeenCalledWith([10, 20]);
  });

  describe('in combat', () => {
    beforeEach(() => {
      ws.receive(welcome([token('hero'), { ...token('goblin', 150), ownership: undefined }]));
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

    it('fires an armed attack at once at your one target', () => {
      session.select('hero');
      session.targets.toggle('goblin');
      session.arm('Longsword');
      expect(ws.sent.at(-1)).toEqual({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword' });
      expect(session.armed).toBeUndefined();
    });

    it('smites with a chosen slot on the armed attack, then forgets the choice', () => {
      session.select('hero');
      session.arm('Longsword');
      session.setSmite(2);
      session.attack('goblin');
      expect(ws.sent.at(-1)).toMatchObject({ t: 'attack', attack: 'Longsword', smite: 2 });
      session.arm('Longsword');
      expect(session.smite).toBeUndefined();
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
          effects: [],
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

      it('aims a spell at your targets and casts when they are all it needs', () => {
        session.targets.toggle('goblin');
        session.aim('magic-missile', 1);
        expect(ws.sent.at(-1)).toMatchObject({ t: 'cast', targets: ['goblin', 'goblin', 'goblin'] });
        expect(session.aiming).toBeUndefined();
      });

      it('aims a feature like a spell and uses it on the picked creature', () => {
        const inspiration = {
          id: 'bardic-inspiration',
          name: 'Bardic Inspiration',
          level: 1,
          recharge: 'long',
          action: 'bonus',
          spell: { targets: 1, range: 60 },
        };
        ws.receive({ t: 'token', token: { ...wizard(), sheet: { features: [inspiration] } as never } });
        session.aimFeature('bardic-inspiration');
        expect(session.aiming).toMatchObject({ mode: 'creatures', need: 1, feature: 'bardic-inspiration' });
        session.pickTarget('orc');
        expect(ws.sent.at(-1)).toEqual({
          t: 'feature',
          token: 'hero',
          feature: 'bardic-inspiration',
          targets: ['orc'],
        });
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
          token: { ...wizard(), sheet: { caster: { level: 5, spells: [familiar] }, effects: [] } as never },
        });
        session.aim('find-familiar', 1);
        session.chooseSummon('owl');
        session.castAt([150, 50]);
        expect(ws.sent.at(-1)).toMatchObject({ t: 'cast', spell: 'find-familiar', summon: 'owl', point: [150, 50] });
      });

      it('casts for free when asked, keeping the choice when the slot changes', () => {
        session.aim('fireball', 3);
        session.setFreeCast(true);
        session.aim('fireball', 4, session.aiming?.free);
        session.castAt([250, 150]);
        expect(ws.sent.at(-1)).toMatchObject({ t: 'cast', spell: 'fireball', slot: 4, free: true });
      });

      it('cancels an aimed spell or readied attack, and says whether there was one', () => {
        session.aim('fireball', 3);
        expect(session.cancelAction()).toBe(true);
        expect(session.aiming).toBeUndefined();
        session.arm('Longsword');
        expect(session.cancelAction()).toBe(true);
        expect(session.armed).toBeUndefined();
        expect(session.cancelAction()).toBe(false);
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
      ws.receive({ t: 'token', token: { ...token('goblin', 150), ownership: undefined, health: 'hurt' } });
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
