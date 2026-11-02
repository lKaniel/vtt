import { characterLevel, type ClientMessage, featureSpell } from '@vtt/system-dnd5e';

/** How a chat roll is applied: in full, half, double, or as healing. */
export type ApplyHow = Extract<ClientMessage, { t: 'applyDamage' }>['how'];
import type { Point, RollMode } from '@vtt/shared';
import { PackSession } from './session-packs.ts';
import { aimAtTargets, aimFor, aimSpell, castMessage, pick, scrollAiming, type Aiming } from './targeting.ts';
import { Targets } from './targets.ts';
import { loadRollMode, saveRollMode } from './roll-mode.ts';
import { tokenAt } from './drops.ts';

// What the selected creature is about to do: an armed attack or an aimed
// spell or feature, which go straight at your targets when you have them,
// and who sees the rolls they make (your roll mode).

export abstract class ActionSession extends PackSession {
  /** The attack the selected token will make on the next token clicked. */
  armed?: string;
  /** Slot level to Divine Smite with on the armed attack. */
  smite?: number;
  /** The spell the selected token is aiming, and what it has picked so far. */
  aiming?: Aiming;
  /** The creatures you target (T), and the others'. */
  readonly targets = new Targets({
    send: (msg) => this.send(msg),
    changed: () => this.notify('targets'),
    you: () => this.you,
  });
  /** Who sees your rolls and the cards of your actions (see roll-modes.ts). */
  rollMode: RollMode = loadRollMode();

  protected abstract notify(event: 'armed' | 'targets' | 'lighting'): void;

  /** Applies the roll on a chat card to your targets, else the creatures selected (see damage-actions.ts on the server). */
  applyRoll(card: string, how: ApplyHow): void {
    const picked = [...this.tokens.keys()].filter((id) => this.isSelected(id));
    const tokens = this.targets.mine.size ? [...this.targets.mine] : picked;
    if (!tokens.length) return this.showError('Target or select the creatures to apply it to');
    this.send({ t: 'applyDamage', card, tokens, how });
  }

  /** T: targets the creature under the pointer, or lets it go; over empty ground lets all yours go. False: nothing to do. */
  toggleTargetAtPointer(): boolean {
    const token = this.pointer && tokenAt(this.tokens.values(), this.pointer, this.gridSize());
    if (!token) return this.targets.clear();
    this.targets.toggle(token.id);
    return true;
  }

  /** Readies an attack of the selected token; the next token clicked is the target, or it goes at once at your one target. */
  arm(attack: string | undefined): void {
    this.armed = attack;
    this.smite = undefined;
    this.aiming = undefined;
    const target = attack && this.targets.only();
    if (target && target !== this.selected) return this.attack(target);
    this.notify('armed');
    this.changed();
  }

  /** Who sees your rolls from now on. */
  setRollMode(mode: RollMode): void {
    this.rollMode = mode;
    saveRollMode(mode);
    this.send({ t: 'rollMode', mode });
    this.changed();
  }

  /** Readies a spell of the selected token with a slot, or for free; self spells go off at once. */
  aim(spellId: string | undefined, slot = 0, free = false): void {
    const sheet = this.selected ? this.tokens.get(this.selected)?.sheet : undefined;
    this.armed = undefined;
    this.aimed(aimFor(sheet, spellId, { slot, free }));
  }

  /** Readies a feature of the selected token that's aimed like a spell; one without targets goes off at once. */
  aimFeature(featureId: string | undefined): void {
    const token = this.selected ? this.tokens.get(this.selected) : undefined;
    const feature = token?.sheet?.features.find((f) => f.id === featureId);
    this.armed = undefined;
    this.aimed(
      feature && {
        ...aimSpell(featureSpell(feature), 0, feature.classLevel ?? characterLevel(token?.stats) ?? 1),
        feature: feature.id,
      },
    );
  }

  /** Readies the spell on a scroll the selected token carries. */
  aimScroll(spellId: string | undefined): void {
    this.armed = undefined;
    this.aimed(scrollAiming(this.selected ? this.tokens.get(this.selected) : undefined, spellId));
  }

  /** Aims `aiming`: a self spell goes off at once, and one aimed at creatures picks your targets first. */
  private aimed(aiming: Aiming | undefined): void {
    const at = aiming && aimAtTargets(aiming, [...this.targets.mine]);
    this.aiming = at?.aiming;
    if (aiming?.mode === 'self' || at?.done) return this.confirmCast();
    this.notify('armed');
    this.changed();
  }

  /** Casts the aimed spell without spending a slot, or with one again. */
  setFreeCast(free: boolean): void {
    if (this.aiming) this.aiming = { ...this.aiming, free };
    this.changed();
  }

  /** Puts away an aimed spell or readied attack; false if there was none. */
  cancelAction(): boolean {
    if (!this.armed && !this.aiming) return false;
    this.arm(undefined);
    return true;
  }

  /** Changes what the aimed summoning spell brings. */
  chooseSummon(monster: string): void {
    if (this.aiming) this.aiming = { ...this.aiming, summon: monster };
    this.changed();
  }

  pickTarget(id: string): void {
    if (!this.aiming) return;
    const { aiming, done } = pick(this.aiming, id);
    this.aiming = aiming;
    if (done) this.confirmCast();
    else this.changed();
  }

  /** Casts the aimed spell at a point (areas, teleports, summons). */
  castAt(point: Point): void {
    this.confirmCast(point);
  }

  /** Casts the aimed spell now, with the targets picked so far. */
  confirmCast(point?: Point): void {
    if (this.selected && this.aiming) this.send(castMessage(this.selected, this.aiming, point));
    this.aim(undefined);
  }

  /** Spends a slot of this level on Divine Smite if the armed attack hits; undefined for no smite. */
  setSmite(slot: number | undefined): void {
    this.smite = slot;
    this.changed();
  }

  attack(target: string): void {
    if (!this.selected || !this.armed) return;
    const smite = this.smite ? { smite: this.smite } : {};
    this.send({ t: 'attack', attacker: this.selected, target, attack: this.armed, ...smite });
    this.arm(undefined);
  }
}
