# Comparison · Illusive vs DAS · Core

**DAS:** [dnd5e-combat](https://github.com/Darshyne/dnd5e-combat) 0.283.0  
**Illusive:** this module, Foundry 14.370, dnd5e 6.0.6

This page compares the two combat engines. It is not the Player's Handbook item list.

## Counts

Read from DAS `content/*.mjs` and from `src/content/` plus `src/domain/triggers/moments.mjs`.

| | DAS | Illusive |
| --- | ---: | ---: |
| Published moments | 29 | 35 |
| Content identifiers | 791 | 193 match short names, 201 instruction ids |
| Same short name in both | 152 | 152 |
| Only in DAS | 639 | — |
| Illusive short names with no DAS key of that id | — | 41 |
| Catalog entries | — | 226 |

Three of the first 38 shared names match an effect, not an item short name, so they are outside the 152: Armor of Agathys, Blur, Protection from Evil and Good. 38 − 3 + 117 = 152.

## Architecture

| | DAS · Core | Illusive |
| --- | --- | --- |
| Combat loop | Owns it. Exclusive with Midi-QOL | Owns it. `module.json` conflicts with Midi-QOL and with `dnd5e-combat` |
| Dice, activities, slots, conditions | Its own flow | dnd5e |
| Content | 284-key records, `api.content.register` | An instruction: match, moment, steps. Citation in `src/rules/catalog.mjs` |
| HUD, Beyond, animation | Separate repositories | Inside this module |
| Automation levels | essentials / assisted / full | One level. Shipped instructions are on |

## Subsystems

| Subsystem | Status |
| --- | --- |
| Attack, damage, saves, concentration, cover, flanking, opportunity attacks, Ready, weapon masteries, undo, reaction relay | Both |
| Vision, pathfinding, climb, jump, fall | Both, and DAS has the larger movement set. Illusive has Feather Fall, Slow Fall, grid pathing, and light at a token |
| Auras | Both. Illusive applies the save auras and Aura of Alacrity. Aura of Warding and Aura of Conquest do nothing |
| Zones | Both. Illusive places filled circles. Wall of Force and Wall of Stone are 10-foot circles. Forcecage is 20 feet. They are not a wall line or a cage of bars |
| Antimagic | Partial. Globe of Invulnerability and Antimagic Field are circles. A cancelled cast does not refund the slot. Items are not suppressed |
| Teleport | Partial. Misty Step moves you to 5 feet from the selected creature within 30 feet. Bait and Switch swaps with the nearest ally within 5 feet. Dispel Evil and Good dismissal hides the creature and marks it defeated. Dimension Door, Plane Shift, Teleport, Teleportation Circle, Transport via Plants, Tree Stride, and Word of Recall use dnd5e's Teleport button |
| Metamagic | Both. Illusive offers eight options on the cast |
| Wild Shape | Partial. The sheet activity transforms. The `wildShape` step needs a chosen beast |
| Grapple | Partial. Grappler uses the grapple step. The flag is not cleared when the grapple ends |
| Legendary resistance | Partial. The step and the action-bar button exist. No monster instruction ships it |
| Portent | Both. Illusive replaces an attack or a save. It does not replace an ability check |
| Evasive Footwork | The superiority die is spent. Nothing reads the AC bonus |
| Ethereal plane | DAS only. Blink and Etherealness set the ethereal status. The token stays on this scene |
| Summons | DAS only as its own creator. 34 SRD spells have a dnd5e summon activity, and dnd5e places that profile. This module does not create the actor |
| Doors and locks | DAS only. Knock and Arcane Lock do not change a lock |
| Factions, group rolls, world diagnostic, content recipes | DAS only |
| D&D Beyond live sync, the action bar, the phone sheet | Illusive only |

## Still not a step

| System | What is missing |
| --- | --- |
| Summons | This module does not create an actor or a token |
| Ethereal | No second plane |
| Doors and locks | No door or lock state |

These stay on the sheet item, not in an instruction: Medium Armor Master, Persistent Rage, Athlete standing from prone, Crossbow Expert's close-range penalty (this module never applies that penalty), Armor of Shadows, and Wild Shape's own transform activity.
