# SRD content

- `monsters-5.1.json`: monsters for the 2014 rules, from the System Reference
  Document 5.1 by Wizards of the Coast.
- `monsters-5.2.json`: monsters for the 2024 rules, from the System Reference
  Document 5.2 by Wizards of the Coast.
- `spells-5.1.json`, `spells-5.2.json`: every SRD spell for each edition.
- `classes-5.1.json`, `classes-5.2.json`: the SRD classes, their features by
  level and spellcasting tables.
- `items.json`: weapons, armor and gear, shared by both editions (weapon
  masteries only apply under the 2024 rules). Gear with `use` can be used from
  the action bar: `{ "heal": "2d4+2", "potion": true }` (a potion is an action
  in 2014, a bonus action in 2024).

Monsters, spells and classes are converted from the `@opencharacter/5e-srd-5.1`
and `@opencharacter/5e-srd-5.2` npm packages (also CC-BY-4.0):

```sh
pnpm --filter @vtt/shared import-srd <5.1 package dir> <5.2 package dir>
```

The import only brings the text and the plain numbers (damage dice, saves,
areas, range). What the rules automate beyond that is written by hand in two
overlays that are merged in when the content loads, keyed `"both"`, `"2014"`
or `"2024"`:

- `spell-automation.json`: per spell id, effects (bless, hold person),
  beams (scorching ray), summons (find familiar), teleports (misty step), `push` in feet
  (thunderwave; negative pulls), `tempHp` (false life), `hpPool` (2014 sleep),
  `drain` (vampiric touch), `rider` (`"self"`: the damage rides on the
  caster's weapon hits, like divine favor and smites; `"mark"`: on the
  caster's attacks against the target, like hunter's mark and hex), and a `gmNote` for the part the GM still does by
  hand. `null` takes away a generated field; `"automated": false` makes the
  chat say the GM applies the spell.
- `class-automation.json`: per class id, spellcasting and features with
  uses, actions and effects (second wind, rage, sneak attack, weapon mastery).

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
