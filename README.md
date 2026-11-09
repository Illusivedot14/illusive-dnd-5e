# Illusive D&D 5e

Standalone D&D 5e combat automation for Foundry VTT. The Illusive D&D HUD is built in.

**Foundry:** v14 · **System:** dnd5e **5.3.3** · **Module deps:** none

Illusive owns the combat loop: economy → activity use → attack vs AC → damage → apply HP to tokens, plus opportunity attacks, cover, movement, vision, lighting, and loot.

## Layout

```text
src/
  main.mjs
  domain/        pure rules (hit, cover, OA reach, path) — no Foundry
  application/   use cases: resolve · economy · targeting · movement · party-combat · …
  foundry/       adapters: dnd5e · token-light/aura · spell-regions · scene facts
  rules/         citations
  i18n/
  hud/           presentation only (clicks, DOM, templates)
```

**Layer rule:** HUD never calls `setFlag`, `applyDamage`, `activity.use`, or `actor.update` directly — only `application/` / `foundry/`. Ability clicks go through `application/use-ability-command.mjs`. Range/economy/HP helpers live once in application (not duplicated in HUD).

## What it does

| Area | Behavior |
|---|---|
| **Resolve** | Attack: roll → hit check → damage → apply to hit tokens. Damage/heal: roll → apply. |
| **Economy** | Spends action/bonus/reaction on use; resets on turn. |
| **OA** | Leave-reach → reaction prompt. |
| **Cover** | none / half / ¾ / total; blocks total cover targeting. |
| **Movement** | Path preview / commit / undo. |
| **Vision / light** | Visibility + light-at-point. |
| **Loot** | Transfer / drop validate + apply. |

## Dev

```bash
npm install
npm test
```

API: `game.modules.get("illusive-dnd-5e").api`
