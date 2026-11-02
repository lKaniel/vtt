import { canControl, chatFor, type Player } from '@vtt/shared';
import { applyDamage, type ChatMessage, type DamageType, DamageTypeSchema } from '@vtt/system-dnd5e';
import { Refusal, type Table } from './table.ts';

// Applying a roll from chat to creatures, as Foundry's damage card buttons
// do: the total in full, halved, doubled or as healing. A damage type
// written after the formula ("/r 8d6 fire") meets resistances. It is one
// game action, so the GM can undo it like any other.

export type ApplyHow = 'full' | 'half' | 'double' | 'heal';

export interface ApplyMessage {
  t: 'applyDamage';
  card: string;
  tokens: string[];
  how: ApplyHow;
}

const SCALE: Record<Exclude<ApplyHow, 'heal'>, (n: number) => number> = {
  full: (n) => n,
  half: (n) => Math.floor(n / 2),
  double: (n) => n * 2,
};

export class DamageActions {
  constructor(
    private table: Table,
    private cards: () => readonly ChatMessage[],
  ) {}

  /** `player` applies the roll on a card they can read to creatures they see and control. */
  apply(player: Player, canSee: (id: string) => boolean, msg: ApplyMessage): void {
    const card = this.cards().find((m) => m.id === msg.card);
    const roll = card && chatFor(card, player)?.roll;
    if (!card || !roll) throw new Refusal('That card has no roll to apply');
    const fighters = [...new Set(msg.tokens)].map((id) => this.target(player, canSee, id));
    const type = DamageTypeSchema.safeParse(card.label).data;
    const amount = Math.max(0, msg.how === 'heal' ? roll.total : SCALE[msg.how](roll.total));
    const lines = fighters.map((f) => (msg.how === 'heal' ? this.heal(f, amount) : this.hurt(f, amount, type)));
    this.table.note(lines.join('. '));
  }

  private target(player: Player, canSee: (id: string) => boolean, id: string) {
    const f = canSee(id) ? this.table.fighter(id) : undefined;
    if (!f) throw new Refusal('No such token');
    if (!canControl(f.token, player)) throw new Refusal(`You don't control ${f.token.name}`);
    return f;
  }

  private hurt({ token, sheet }: ReturnType<Table['fighter']>, amount: number, type?: DamageType): string {
    const plain = { ...sheet, resistances: [], immunities: [], vulnerabilities: [] };
    const after = applyDamage(type ? sheet : plain, [{ amount, type: type ?? 'force' }]);
    const dealt = after.dealt[0] ?? 0;
    this.table.hurt(token, after, dealt);
    return [token.name, 'takes', dealt, type, 'damage'].filter((w) => w !== undefined).join(' ');
  }

  private heal({ token, sheet }: ReturnType<Table['fighter']>, amount: number): string {
    const hp = Math.min(sheet.maxHp, sheet.hp + amount);
    this.table.store.setToken({ ...token, hp: hp >= sheet.maxHp ? undefined : hp });
    return `${token.name} regains ${hp - sheet.hp} hit points`;
  }
}
