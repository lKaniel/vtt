import { describe, expect, it } from 'vitest';
import type { ChatMessage, ServerMessage } from '@vtt/system-dnd5e';
import { ChatLog } from './chat-log.ts';

const card = (text: string): ChatMessage => ({ id: 'c', time: 0, from: 'Combat', color: '#fff', text });

describe('chat log', () => {
  it('replaces an updated card and sends it again', () => {
    const sent: ServerMessage[] = [];
    const seat = { player: { id: 'gm', name: 'GM', color: '#fff', role: 'gm' as const } };
    const log = new ChatLog(
      () => [seat],
      (_, msg) => sent.push(msg),
    );
    log.post(card('Roll Perception'));
    log.update(card('Roll Perception: 14'));
    expect(log.all.map((m) => m.text)).toEqual(['Roll Perception: 14']);
    expect(sent).toHaveLength(2);
    log.update({ ...card('New'), id: 'd' });
    expect(log.all).toHaveLength(2);
  });
});

describe('chat log and disguises', () => {
  it('names a creature in disguise by the name it goes by', () => {
    const sent: ServerMessage[] = [];
    const seat = { player: { id: 'bo', name: 'Bo', color: '#fff', role: 'player' as const } };
    const bram = { name: 'Bram', looks: [{ id: 'm', label: 'Merchant', name: 'Old Tobin' }], look: 'm' };
    const log = new ChatLog(
      () => [seat],
      (_, msg) => sent.push(msg),
      () => [bram],
    );
    log.post({ ...card('Bram hits the goblin'), from: 'Bram' });
    expect(log.all[0]).toMatchObject({ text: 'Old Tobin hits the goblin', from: 'Old Tobin' });
  });
});
