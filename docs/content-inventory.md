# Content inventory — base Foundry dnd5e

Reference catalog of everything Illusive must eventually automate from the **stock dnd5e 5.3.3** system packs (no third-party modules).

Edition focus: **2024 SRD** (`*24` packs). 2014 SRD packs are listed as legacy.

## Sections

1. [Weapon Masteries](weapon-masteries.md) — 8 masteries + PHB weapon mapping
2. [Spells](spells.md) — 340 (2024) + 319 (2014)
3. [Features](features.md) — class/subclass, feats, species traits, monster features
4. [Monster features](monster-features.md) — NPC HUD gems, legendary/lair spend, game log + movement

## Counts (2024)

| Bucket | Count | Pack |
|---|---:|---|
| Weapon masteries | 8 | `CONFIG.DND5E.weaponMasteries` |
| PHB weapons w/ mastery | 38 | `equipment24` |
| Spells | 340 | `spells24` |
| Class/subclass feature items | 255 | `classes24` |
| Advancement feature grants | 244 | `classes24` |
| Feats / styles / boons | 17 | `feats24` |
| Species traits | 36 | `origins24` |
| Monster features | 538 | `monsterfeatures24` |

## Status legend

| Status | Meaning |
|---|---|
| todo | Not yet Illusive-special-cased (may already work via generic activity automation) |
| partial | Some paths work |
| done | Illusive owns the full behavior |

## Combat engines online

| Engine | Covers |
|---|---|
| Turn budget + Extra Attack | A/B/R + attack swings |
| Weapon masteries | All 8 masteries (incl. cleave swing) |
| Hit riders | Smite / Sneak (prompt); Hex / HM (auto); Colossus Slayer / Divine Fury |
| Reaction triggers | OA, Shield, Parry, Protection, Interception, Counterspell, Hellish Rebuke, Absorb Elements (+ next-turn rider), Uncanny Dodge, Deflect Missiles/Attacks/Energy, Silvery Barbs (attacks/saves/checks + ally advantage), Cutting Words, Countercharm (2024), Stone's Endurance, Superior Hunter's Defense, Storm's Thunder, Wrath of the Storm, Retaliation, Riposte, Feather Fall, Slow Fall — hybrid windows in [combat-engine.md](combat-engine.md) |
| Ready | Trigger (move / cast / attack) + readied activity + range; soft reaction prompt on trigger |
| Falling | dnd5e 6 `plummet` fall damage applied to the faller (prone on damage) after the `on-fall` window |
| Mechanical auras | Protection / Courage / Devotion / Life / Purity + Spirit Guardians damage aura |
| Template placer | DAS-style Illusive PIXI preview (hide stock starburst); creates the area Region on confirm (circle / cone / line / rect / emanation, token-attached when not stationary) |
| Template saves | Place → walls-aware auto-target + saves; areas placed outside a driven use auto-save on `createRegion` |
| Roll modifiers | Statuses, Hex, Help, Silvery Barbs grant, flanking, Faerie Fire grants, Reckless / GWM / SS |
| Over-time | Turn start/end damage+saves (`flags.illusive-dnd-5e.overTime`) |
| Special durations | nextAttack / isAttacked / isDamaged / turn / turnStartSource / turnEndSource / currentTurnEnd / rest / combatEnd |
| Activity drive | attack, damage, heal, save, check, summon, forward + Ice Knife follow-ups |
| Declared triggers | Blur, Protection from Evil and Good, Armor of Agathys, Heavy Armor Master, Dark One's Blessing, Defensive Duelist — [combat-engine.md §15](combat-engine.md#15-declared-triggers) |
| `illusive-dnd-5e.combatFx` | Animation seam |

## How to refresh

Re-dump LevelDB packs from `Data/systems/dnd5e/packs` (Foundry may lock files — copy without `LOCK` first), then regenerate these markdown files from `docs/reference/*.json` via `node scripts/generate-content-docs.mjs`.
