import { characterLevel, type ClientMessage, featureSpell } from '@vtt/system-dnd5e';

/** How a chat roll is applied: in full, half, double, or as healing. */
export type ApplyHow = Extract<ClientMessage, { t: 'applyDamage' }>['how'];
import type { Player, Point, RollMode } from '@vtt/shared';
import type { TokenView } from '@vtt/system-dnd5e';
import { aimAtTargets, aimFor, aimSpell, castMessage, pick, scrollAiming, type Aiming } from './targeting.ts';
import type { Targets } from './targets.ts';
import { loadRollMode, saveRollMode } from './roll-mode.ts';
import { tokenAt } from './drops.ts';

// What the selected creature is about to do: an armed attack or an aimed
// spell or feature, which go straight at your targets when you have them,
// and who sees the rolls they make (your roll mode). Reached as
// `session.actions`.

/** What the actions need of the session: the tokens, your selection and targets, and a way to the server. */
export interface ActionHost {
  readonly tokens: ReadonlyMap<string, TokenView>;
  readonly selected?: string;
  readonly pointer?: Point;
  readonly you?: Player;
  readonly targets: Targets;
  isSelected(id: string): boolean;
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
  /** The spell the selected token is aiming, and what it has picked so far. */
  aiming?: Aiming;
  /** Who sees your rolls and the cards of your actions (see roll-modes.ts). */
  rollMode: RollMode = loadRollMode();

  constructor(
    private readonly s: ActionHost,
    private readonly on: ActionEvents,
  ) {}

  /** Applies the roll on a chat card to your targets, else the creatures selected (see damage-actions.ts on the server). */
  applyRoll(card: string, how: ApplyHow): void {
    const picked = [...this.s.tokens.keys()].filter((id) => this.s.isSelected(id));
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

  /** Readies a spell of the selected token with a slot, or for free; self spells go off at once. */
  aim(spellId: string | undefined, slot = 0, free = false): void {
    const sheet = this.s.selected ? this.s.tokens.get(this.s.selected)?.sheet : undefined;
    this.armed = undefined;
    this.aimed(aimFor(sheet, spellId, { slot, free }));
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
      },
    );
  }

  /** Readies the spell on a scroll the selected token carries. */
  aimScroll(spellId: string | undefined): void {
    this.armed = undefined;
    this.aimed(scrollAiming(this.s.selected ? this.s.tokens.get(this.s.selected) : undefined, spellId));
  }

  /** Aims `aiming`: a self spell goes off at once, and one aimed at creatures picks your targets first. */
  private aimed(aiming: Aiming | undefined): void {
    const at = aiming && aimAtTargets(aiming, [...this.s.targets.mine]);
    this.aiming = at?.aiming;
    if (aiming?.mode === 'self' || at?.done) return this.confirmCast();
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
    if (done) this.confirmCast();
    else this.on.changed();
  }

  /** Casts the aimed spell at a point (areas, teleports, summons). */
  castAt(point: Point): void {
    this.confirmCast(point);
  }

  /** Casts the aimed spell now, with the targets picked so far. */
  confirmCast(point?: Point): void {
    if (this.s.selected && this.aiming) this.s.send(castMessage(this.s.selected, this.aiming, point));
    this.aim(undefined);
  }

  /** Spends a slot of this level on Divine Smite if the armed attack hits; undefined for no smite. */
  setSmite(slot: number | undefined): void {
    this.smite = slot;
    this.on.changed();
  }

  attack(target: string): void {
    if (!this.s.selected || !this.armed) return;
    const smite = this.smite ? { smite: this.smite } : {};
    this.s.send({ t: 'attack', attacker: this.s.selected, target, attack: this.armed, ...smite });
    this.arm(undefined);
  }
}
