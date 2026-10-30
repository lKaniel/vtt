# SRD content

- `monsters-5.1.json`: monsters for the 2014 rules, from the System Reference
  Document 5.1 by Wizards of the Coast.
- `monsters-5.2.json`: monsters for the 2024 rules, from the System Reference
  Document 5.2 by Wizards of the Coast.
- `items.json`: weapons, armor and gear, shared by both editions (weapon
  masteries only apply under the 2024 rules).

Both documents are available under the Creative Commons Attribution 4.0
license (https://creativecommons.org/licenses/by/4.0/legalcode).

The world's `rules` setting picks the edition (default `"2014"`); a character
can follow the other one with `"stats": { "rules": "2024" }`. Tokens refer to
content by id: `"monster": "goblin"` (2014) or `"goblin-warrior"` (2024),
`"inventory": [{ "item": "longsword", "equipped": true }]`. Stat blocks only
carry what the combat rules automate so far (AC, HP, abilities, attacks,
damage defenses).
