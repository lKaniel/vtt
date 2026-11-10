# SRD content

- `monsters-5.1.json`: monsters for the 2014 rules, from the System Reference
  Document 5.1 by Wizards of the Coast.
- `monsters-5.2.json`: monsters for the 2024 rules, from the System Reference
  Document 5.2 by Wizards of the Coast. Legendary monsters carry their
  `legendary` actions (5.1 options link their attack) and
  `legendaryResistance`. Every monster also carries what its stat block has
  beyond attacks: `multiattack` (attacks per action, counted from the words
  of Multiattack), `features` (actions behind a saving throw, such as breath
  weapons: class-style features aimed like a spell, with `uses` a day or
  `rechargeOn` for "Recharge 5-6"), `traits` (everything else, as text the GM
  runs), `skills`, `expertise`, `languages`, `alignment` and `speeds`
  (`scripts/monster-convert.ts`).
- `spells-5.1.json`, `spells-5.2.json`: every SRD spell for each edition.
- `classes-5.1.json`, `classes-5.2.json`: the SRD classes, their features by
  level and spellcasting tables.
- `items-5.1.json`, `items-5.2.json`: every SRD weapon, armor, tool, piece of
  gear and magic item for each edition, with Foundry-style variants (a
  longsword +1, a flame tongue for each sword, armor of resistance for each
  damage type and armor). Magic items carry what they do: `effect` while worn
  (the same modifiers as a spell's effect), `bonus` (`ac`, `saves`,
  `spellAttack`, `spellDc`), `plus` and `hitDamage` riders on weapons,
  `use` for what drinking or reading does (`heal`, `tempHp`, `effect`,
  `raise`), `casts` with `charges` (`{ "max": 7, "recharge": "1d6+1" }`) and
  `dc` for wands and staffs. A world's mundane gear from the other edition
  fills in what its own lacks (a 2014 world's musket).
- `items.json`: hand-written items the packs don't have (the spell scroll).

Monsters, spells, classes and items are converted from the `@opencharacter/5e-srd-5.1`
and `@opencharacter/5e-srd-5.2` npm packages (also CC-BY-4.0):

```sh
pnpm --filter @vtt/system-dnd5e import-srd <5.1 package dir> <5.2 package dir>
```

Add `classes` (or `spells`, `monsters`, `origins`, `items`) after the two folders to
write only those files. Classes come with their subclasses, the options a
character picks (fighting styles, invocations, metamagic, a druid's land) as
features with a `choice`, and `grantsSpells` for spells a feature always has
prepared (domain and oath spells). Every class and subclass feature up to 5th
level is either run by the engine or carries a `manual` note saying how the GM
runs it (`src/class-coverage.test.ts`).

The import only brings the text and the plain numbers (damage dice, saves,
areas, range). What the rules automate beyond that is written by hand in overlays
that are merged in when the content loads, keyed `"both"`, `"2014"`
or `"2024"`:

- `spell-automation.json`: per spell id, effects (bless, hold person),
  beams (scorching ray), summons (find familiar), teleports (misty step), `push` in feet
  (thunderwave; negative pulls), `tempHp` (false life), `hpPool` (2014 sleep),
  `drain` (vampiric touch), `rider` (`"self"`: the damage rides on the
  caster's weapon hits, like divine favor and smites; `"mark"`: on the
  caster's attacks against the target, like hunter's mark and hex), `zone`
  (`{ "spares": "allies", "onCast": false }`: the area lasts and hits
  creatures that start their turn in it or enter it), `repeat` (`"action"` or
  `"bonus"`: used again on later turns without a slot), `cures` (conditions
  whose effects end, like lesser restoration), `revive` (revivify),
  `upcast.maxHp` (aid's raised maximum per slot), and a `gmNote` for the part the GM still does by
  hand. `null` takes away a generated field; `"automated": false` makes the
  chat say the GM applies the spell.
- `item-automation.json`: per item id (or a family, `"vicious-weapon-*"`),
  what the packs leave out: light sources' `use.light` (a torch, a lantern
  with `"fuel": "oil-flask"`), `container` (`{ "capacity": 30 }` in pounds,
  `"weightless": true` for a bag of holding), hand-written effects (a ring of
  free action), `gmNote`, and `manual` (`{ "kind": "gm" | "utility", "why" }`)
  for what the GM runs. Every magic item does something or says what the GM
  runs (`src/item-audit.test.ts`).
- `class-automation.json`: per class id, spellcasting and features with
  uses, actions and effects (second wind, rage, sneak attack, weapon mastery),
  `grantAttacks` (flurry of blows) and `speed` by level for a passive effect
  (unarmored movement). A feature id the generated class lacks is added whole,
  with its own `name` and `level` (flurry of blows, folded into ki in the text).
  `proficiencies` per edition: the armor, weapons, tools and languages it
  gives (`fixed`), picks it offers (`choices`: `{ "id", "pick", "from" }`,
  `from` naming ids or groups like `musical-instruments`, `artisans-tools`,
  `languages`), and its `multiclass` share.
- `origin-automation.json`: the same `proficiencies` for species, subspecies
  and backgrounds by id and edition, and `base` for every character of an
  edition (2024: Common and two standard languages).

A spell or feature without automation still shows its text, and the chat says
the GM applies it.

Both documents are available under the Creative Commons Attribution 4.0
license (https://creativecommons.org/licenses/by/4.0/legalcode).

The world's `rules` setting picks the edition (default `"2014"`); a character
can follow the other one with `"stats": { "rules": "2024" }`. Tokens refer to
content by id: `"monster": "goblin"` (2014) or `"goblin-warrior"` (2024),
`"inventory": [{ "item": "longsword", "equipped": true }]`. Stat blocks only
carry what the rules automate so far (AC, HP, speed, abilities, saves, attacks,
damage and condition defenses).
