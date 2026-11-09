# Monster features (NPC combat)

Illusive surfaces and resolves stock dnd5e **NPC / monster** items on the action bar — the same activity pipeline as PCs (attack, save, damage, cast, utility), plus creature resources.

Pack inventory: `monsterfeatures24` (538) — see [features.md](features.md) and [reference/monsterfeatures24.json](reference/monsterfeatures24.json).

## What shows on the HUD

| Activation | Where | Economy |
|---|---|---|
| `action` | Action gem | Spends Action |
| `bonus` | Bonus gem | Spends Bonus |
| `reaction` | Reaction gem | Spends Reaction (prompted) |
| `legendary` / `mythic` | Legendary gem (when `resources.legact.max`) | Spends 1 legendary action |
| `lair` | Lair gem (when `resources.lair.max`) | Spends 1 lair use |
| `special` (monster/natural feats & weapons) | **Action** gem on NPCs | Free (no A/B/R) |
| Passive / no activity | Not listed | Sheet only |

Natural weapons (`Bite`, `Claw`, …) and combat feats (`Multiattack`, `Fire Breath`, `Frightful Presence`, …) use the owned resolve path: roll → hit/save → damage/effects → game log.

Blank activity activation on monster items defaults to **action** for attack/save/damage/heal/cast/summon, or **special** for other monster utilities.

## Legendary Resistance

Tracked via the resistance gem (`resources.legres`), not as a normal Action button. The sheet feature’s `special` “Expend Use” activity is suppressed from the suitcase on NPCs so it does not duplicate the gem.

## Combat game log (everything)

During combat, the mid-right **Game log** (scroll) records **all** combat uses:

1. **Activity uses** — action / bonus / reaction / legendary / lair / free / special
2. **Standard actions** — Dash, Disengage, Dodge, Help, Hide, Ready
3. **Movement** — each new step on Foundry’s token movement history
4. **Reactions** — linked to the causing action; undoing that action undoes its reactions first

Combat stores a **LIFO of turn lists** (cleared when combat ends):

```
Turn 1: [move, action, move]
Turn 2: [move, bonus, action]
Turn 3: [move, reaction, action]
```

The game-log popup shows the **current turn’s list**. Undo reverses that action and everything after it on the turn (damage, movement, effects) and deletes those entries.

Carousel **back** undoes and **deletes** the current turn list; **previous round** does the same for every turn in the round. **Forward** / next-round logs a skip and advances. One initiative button rolls everyone.

## Status

| Capability | Status |
|---|---|
| List NPC action/bonus/reaction features | done |
| Default blank activations for monster items | done |
| NPC specials under Action | done |
| Legendary gem + spend `legact` | done |
| Lair gem + spend `lair` | done |
| Movement / free / standard / all activity uses in game log | done |
| Game log popup — this token/this turn; undo from entry | done |
| Carousel back undoes turn; forward logs skip; roll-all combined | done |
| Passive traits (no activity) | sheet only (by design) |
| Per-feature special cases (recharge UI, Multiattack macro) | todo — generic activity use covers most |

## Machine-readable

- [reference/monsterfeatures24.json](reference/monsterfeatures24.json)
