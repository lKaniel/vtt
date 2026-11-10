import { characterLevel, type ClientMessage, type FeatureSheet, featureSpell } from '@vtt/system-dnd5e';
import { isPowerFeature, type PowerAim, powerAim } from '../play/power-aiming.ts';

/** How a chat roll is applied: in full, half, double, or as healing. */
export type ApplyHow = Extract<ClientMessage, { t: 'applyDamage' }>['how'];
import type { Player, Point, RollMode } from '@vtt/shared';
import type { Attack, TokenView } from '@vtt/system-dnd5e';
import { aimAtTargets, aimFor, aimSpell, castMessage, pick, scrollAiming, type Aiming } from '../play/targeting.ts';
import { paymentCount } from '../play/payments.ts';
import { itemAiming } from '../play/item-spells.ts';
import type { Targets } from './targets.ts';
import { loadRollMode, saveRollMode } from '../play/roll-mode.ts';
import { tokenAt } from '../play/drops.ts';
import { RollPick } from './session-pick.ts';
import { type RangeAim, type RangeHost, walkInRange } from '../play/walk-in-range.ts';

// What the selected creature is about to do: an armed attack or an aimed
// spell or feature, which go straight at your targets when you have them,
// and who sees the rolls they make (your roll mode). Reached as
// `session.actions`.

/** What the actions need of the session: the tokens, your selection and targets, and a way to the server. */
export interface ActionHost extends RangeHost {
  readonly tokens: ReadonlyMap<string, TokenView>;
  readonly selected?: string;
  readonly pointer?: Point;
  readonly you?: Player;
  readonly targets: Targets;
  readonly editor: { isSelected(id: string): boolean };
  send(msg: ClientMessage): void;
  showError(message: string): void;
}

/** What the actions tell the session. */
export interface ActionEvents {
  changed(): void;
  /** An attack was readied or a spell aimed, or put away. */
  armed(): void;
  gridSize(): number;
}

/** The selected creature's readied attack or aimed spell, and your roll mode, as `session.actions`. */
export class Actions {
  /** The attack the selected token will make on the next token clicked. */
  armed?: string;
  /** Slot level to Divine Smite with on the armed attack. */
  smite?: number;
  /** The hit finisher (a feature id) to spend momentum dice on if the armed attack hits. */
  finisher?: string;
  /** The spell the selected token is aiming, and what it has picked so far. */
  aiming?: Aiming;
  /** Who sees your rolls and the cards of your actions (see roll-modes.ts). */
  rollMode: RollMode = loadRollMode();
  /** Advantage, disadvantage or a critical picked for your next roll (session-pick.ts). */
  readonly pick: RollPick;

  constructor(
    private readonly s: ActionHost,
    private readonly on: ActionEvents,
  ) {
    this.pick = new RollPick(on, s);
  }

  /** Applies the roll on a chat card to your targets, else the creatures selected (see damage-actions.ts on the server). */
  applyRoll(card: string, how: ApplyHow): void {
    const picked = [...this.s.tokens.keys()].filter((id) => this.s.editor.isSelected(id));
    const tokens = this.s.targets.mine.size ? [...this.s.targets.mine] : picked;
    if (!tokens.length) return this.s.showError('Target or select the creatures to apply it to');
    this.s.send({ t: 'applyDamage', card, tokens, how });
  }

  /** T: targets the creature under the pointer, or lets it go; over empty ground lets all yours go. False: nothing to do. */
  toggleTargetAtPointer(): boolean {
    const token = this.s.pointer && tokenAt(this.s.tokens.values(), this.s.pointer, this.on.gridSize());
    if (!token) return this.s.targets.clear();
    this.s.targets.toggle(token.id);
    return true;
  }

  /** Readies an attack of the selected token; the next token clicked is the target, or it goes at once at your one target. */
  arm(attack: string | undefined): void {
    this.armed = attack;
    this.smite = undefined;
    this.finisher = undefined;
    this.aiming = undefined;
    const target = attack && this.s.targets.only();
    if (target && target !== this.s.selected) return this.attack(target);
    this.on.armed();
    this.on.changed();
  }

  /** Who sees your rolls from now on. */
  setRollMode(mode: RollMode): void {
    this.rollMode = mode;
    saveRollMode(mode);
    this.s.send({ t: 'rollMode', mode });
    this.on.changed();
  }

  /**
   * Readies a spell of the selected token with a slot, for free, or paid by a feature (`paidBy`). A self spell
   * goes off at once, unless there is more than one way to pay for it: then it waits for Cast.
   */
  aim(spellId: string | undefined, slot = 0, pay: { free?: boolean; paidBy?: string } = {}): void {
    const token = this.s.selected ? this.s.tokens.get(this.s.selected) : undefined;
    this.armed = undefined;
    const aiming = aimFor(token?.sheet, spellId, { slot, ...pay });
    const choose = !!token && aiming?.mode === 'self' && !aiming.repeat && paymentCount(token, aiming.spell) > 1;
    this.aimed(aiming, choose);
  }

  /** Readies a feature of the selected token that's aimed like a spell; one without targets goes off at once. */
  aimFeature(featureId: string | undefined): void {
    const token = this.s.selected ? this.s.tokens.get(this.s.selected) : undefined;
    const feature = token?.sheet?.features.find((f) => f.id === featureId);
    this.armed = undefined;
    this.aimed(
      feature && {
        ...aimSpell(featureSpell(feature), 0, feature.classLevel ?? characterLevel(token?.stats) ?? 1),
        feature: feature.id,
        ...(isPowerFeature(feature) && { power: powerAim(feature) }),
      },
    );
  }

  /** The aimed pool feature, as the selected token has it. */
  get aimedPower(): FeatureSheet | undefined {
    if (!this.aiming?.power) return undefined;
    const token = this.s.selected ? this.s.tokens.get(this.s.selected) : undefined;
    return token?.sheet?.features.find((f) => f.id === this.aiming?.feature);
  }

  /** Changes the aimed pool feature's picks, inputs or action. */
  // fallow-ignore-next-line unused-class-member -- PowerControls.tsx calls it (fallow --type-aware finds it)
  changePower(change: (aim: PowerAim, feature: FeatureSheet) => PowerAim): void {
    const feature = this.aimedPower;
    if (!this.aiming?.power || !feature) return;
    this.aiming = { ...this.aiming, power: change(this.aiming.power, feature) };
    this.on.changed();
  }

  /** Readies the spell on a scroll the selected token carries. */
  aimScroll(spellId: string | undefined): void {
    this.armed = undefined;
    this.aimed(scrollAiming(this.s.selected ? this.s.tokens.get(this.s.selected) : undefined, spellId));
  }

  /** Readies a spell the selected token casts from a magic item (inventory `index`), at `slot` or the lowest it allows. */
  aimItem(index: number, spellId: string, slot?: number): void {
    this.armed = undefined;
    this.aimed(itemAiming(this.s.selected ? this.s.tokens.get(this.s.selected) : undefined, index, spellId, slot));
  }

  /** Aims `aiming`: a self spell goes off at once unless told to `wait`, and one aimed at creatures picks your targets first. */
  private aimed(aiming: Aiming | undefined, wait = false): void {
    const at = aiming && aimAtTargets(aiming, [...this.s.targets.mine]);
    this.aiming = at?.aiming;
    if (!aiming?.power && !wait && (aiming?.mode === 'self' || at?.done)) return this.confirmCast();
    this.on.armed();
    this.on.changed();
  }

  /** Casts the aimed spell without spending a slot, or with one again. */
  setFreeCast(free: boolean): void {
    if (this.aiming) this.aiming = { ...this.aiming, free };
    this.on.changed();
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
    this.on.changed();
  }

  /** Changes the form the aimed shape-shifting spell gives its targets (polymorph). */
  chooseForm(form: string): void {
    if (this.aiming) this.aiming = { ...this.aiming, form };
    this.on.changed();
  }

  /** Changes the aimed spell's option (a damage type, enlarge or reduce). */
  chooseOption(choice: string): void {
    if (this.aiming) this.aiming = { ...this.aiming, choice };
    this.on.changed();
  }

  pickTarget(id: string): void {
    if (!this.aiming) return;
    const { aiming, done } = pick(this.aiming, id);
    this.aiming = aiming;
    if (done && !aiming.power) this.confirmCast();
    else this.on.changed();
  }

  /** Casts the aimed spell at a point: areas, teleports and summons, or a spell aimed at creatures spent on empty ground. */
  castAt(point: Point): void {
    this.confirmCast(point);
  }

  /** Casts the aimed spell now, with the targets picked so far. */
  confirmCast(point?: Point): void {
    const { selected } = this.s;
    const aiming = this.aiming;
    const inRange = selected && aiming && this.closeIn(selected, { spell: aiming.spell, targets: aiming.picks, point });
    if (inRange) this.s.send(this.picked(castMessage(selected, aiming, point)));
    this.aim(undefined);
  }

  /** Walks into range of `aim` first: not for a spell on yourself, nor for one used again where it is (spiritual weapon). */
  private closeIn(mover: string, aim: RangeAim): boolean {
    if ('spell' in aim && (this.aiming?.mode === 'self' || this.aiming?.repeat)) return true;
    return walkInRange(this.s, mover, aim);
  }

  /** The readied attack as the selected token has it. */
  private armedAttack(): Attack | undefined {
    const token = this.s.selected ? this.s.tokens.get(this.s.selected) : undefined;
    return token?.sheet?.attacks.find((a) => a.name === this.armed);
  }

  /** Walks into range of the readied attack's target or point; true when there's nothing to check. */
  private attackInRange(aim: { target?: string; point?: Point }): boolean {
    const attack = this.armedAttack();
    return !attack || !this.s.selected || this.closeIn(this.s.selected, { attack, ...aim });
  }

  /** Spends a slot of this level on Divine Smite if the armed attack hits; undefined for no smite. */
  setSmite(slot: number | undefined): void {
    this.smite = slot;
    this.on.changed();
  }

  /** Spends every momentum die on this finisher if the armed attack hits; undefined for none. */
  setFinisher(finisher: string | undefined): void {
    this.finisher = finisher;
    this.on.changed();
  }

  /** A cast (or a feature aimed like one) with your roll pick when it rolls to hit; others leave the pick for a later roll. */
  private picked(msg: ClientMessage): ClientMessage {
    if (!['cast', 'feature'].includes(msg.t) || !this.aiming?.spell.attack || this.aiming.spell.autoHit) return msg;
    return { ...msg, ...this.pick.take() };
  }

  /** Spends the readied attack on empty ground at `point`: it hits nothing. */
  attackAt(point: Point): void {
    if (!this.s.selected || !this.armed) return;
    if (!this.attackInRange({ point })) return this.arm(undefined);
    this.s.send({ t: 'attack', attacker: this.s.selected, attack: this.armed, point, ...this.pick.take() });
    this.arm(undefined);
  }

  attack(target: string): void {
    if (!this.s.selected || !this.armed) return;
    if (!this.attackInRange({ target })) return this.arm(undefined);
    const smite = this.smite ? { smite: this.smite } : {};
    const finisher = this.finisher ? { finisher: this.finisher } : {};
    const pick = this.pick.take();
    this.s.send({ t: 'attack', attacker: this.s.selected, target, attack: this.armed, ...smite, ...finisher, ...pick });
    this.arm(undefined);
  }
}
