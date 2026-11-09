# D&D 5e Combat Automation Module for Foundry VTT

**Status:** Discovery complete · slices C1–C4, M1, V1, L1, Q1 implemented  
**Version:** 0.9  
**Last updated:** 2026-11-09

## 1. Purpose

Design an integrated, easier-to-use automation module for Foundry VTT’s D&D 5e system. Its scope includes combat, movement and pathfinding, vision simulation, lighting, and loot, presented through the reworked Illusive D&D HUD. It should provide this broad capability set through a clear, maintainable architecture and a simple user experience. The module should rely on the system for rules and data wherever possible, preserve 2014/2024 source distinctions, and cite each rules ruling it implements.

**Implementation form (confirmed):** one Foundry add-on module (`illusive-dnd-5e`) over the official D&D 5e system. Not a system fork.

### Confirmed user needs

- Automation should be no more complex than the table needs.
- The UI should be pleasant to use.
- Behavior should be transparent: the user wants to understand what the module did and why.
- Customization should be clear: each available control should explain what it changes and how to use it.
- The Illusive D&D HUD is the frontend; do not create a separate HUD.
- Desired automation domains: combat, movement/pathfinding, vision simulation, lighting, and loot.

### Product requirements

- Publish a plain list of what the module handles vs what stays manual (see §12).
- Keep HUD presentation separate from the rule-resolution engine.
- For each automated action, show trigger, target, result, and applied changes; provide a correction path.
- Make customization discoverable and outcome-based.
- Zero Foundry **module** dependencies. System relationship: `dnd5e` only.

### Confirmed project target

| Item | Value |
|---|---|
| Foundry | **14** (module `compatibility.verified`: 14) |
| Installed dnd5e package | **5.3.3** (compatibility minimum 13.347, verified 14) |
| Rules baseline | **2024**, with selected **2014 / Legacy** variants labeled |
| Package | Single module `illusive-dnd-5e` |

**Content to automate (inventory):** [content-inventory.md](content-inventory.md) — Weapon Masteries, Spells, Features from stock dnd5e 5.3.3 packs.

> Note: DAS advertises dnd5e **6.0+**. This world currently runs **5.3.3**. v1 integrates against 5.3.3 public hooks (`dnd5e.preUseActivity`, `dnd5e.postUseActivity`, `dnd5e.rollAttackV2`, `dnd5e.rollDamageV2`, death-save hooks). Re-verify when upgrading the system package.

---

## 2. Source and citation policy

1. Controlling source: official rulebook + errata; record book, section/glossary, printed page.
2. D&D Beyond locators are helpers, not replacements for book citations.
3. Keep 2014 and 2024 distinct; never silently substitute.
4. Table/house rules labeled as such.
5. Unsettled questions stay unresolved and prompt the DM — never present implementation as a rules ruling.

### Official source register

| Rules source | Official locator | Use |
|---|---|---|
| *Player’s Handbook* (2014) | [compendium](https://www.dndbeyond.com/sources/dnd/phb-2014) | 2014 / Legacy |
| *Player’s Handbook* (2024) | [compendium](https://www.dndbeyond.com/sources/dnd/phb-2024) | 2024 baseline |
| *Player’s Handbook* (2024) errata | [PDF](https://media.dndbeyond.com/compendium-images/errata/PHB-24/PHB-2024_v1.pdf) | Required when implementing affected text |
| DMG / Monster Manual | To be added when those behaviors are selected | Deferred |

---

## 3. Product decisions

| Decision | Status | Selection |
|---|---|---|
| Rules mode | **Confirmed** | 2024 baseline; 2014 labeled `2014 / Legacy`; use system rulesVersion |
| Domains | **Confirmed** | Combat, movement/pathfinding, vision, lighting, loot |
| Package | **Confirmed** | One add-on module over dnd5e |
| Foundry | **Confirmed** | v14 |
| dnd5e package | **Recorded** | Installed **5.3.3** |
| Frontend | **Confirmed** | Illusive D&D HUD in-repo |
| Automation level (v1) | **Selected** | **Full** always — no essentials/assisted setting; all shipped features on |
| v1 combat automation | **Selected** | Activity use from HUD → track resolution → show explanation → GM correction stub |
| Class/spell library automation | **Out of v1** | Rely on dnd5e item/activity data; no DAS-scale premade library |
| Homebrew authoring UI | **Out of scope** | Not confirmed |
| Animations / ambience FX | **Out of scope** | Not confirmed |

---

## 4. Design principles

- Version each rule; preserve provenance; separate rules from automation.
- Expose uncertainty; avoid destructive migration; prefer small testable rule units.
- Do not ship copied rulebook prose without a permitted basis.

---

## 5. Rule record format

Each implemented rule: `id`, `name`, `edition`, `source`, `errata`, `trigger`, `inputs`, `procedure`, `outcomes`, `dm_decisions`, `automation`, `notes`.

---

## 6. Architecture (confirmed)

```text
src/
  main.mjs
  constants.mjs
  domain/          # pure state & spatial math
  application/     # use cases, view models
  foundry/         # hooks + document/system adapters
  rules/           # citations / metadata
  i18n/
  hud/             # presentation only (boot, settings, lib, components, styles, templates)
```

| Boundary | Owns | Must not own |
|---|---|---|
| `domain/` | Pure transitions, spatial math, rule-context shapes | Foundry, DOM, document writes |
| `application/` | Start/resume workflows, view models, correction commands | Presentation markup, direct Foundry globals |
| `foundry/` | Hooks, dnd5e/document reads/writes, scene facts | Independent rule decisions |
| `hud/` | Controls, prompts, displays | Rule logic, mechanical document updates for resolutions |
| `rules/` | IDs, citations, edition/errata metadata | Copied prose / duplicate procedures |

### Runtime contracts (v1)

```text
combat.startHudAction({ token, item, activity, section, event, useOptions }) -> resolutionId
combat.submitEvent({ resolutionId, event }) -> ActionResolution
combat.correctResolution({ resolutionId, correction }) -> ActionResolution
combat.getHudView({ workflowId }) -> HudViewModel
combat.getLastResolutionView() -> HudViewModel | null

activity.useActivityFromHud(...)     # HUD entry; validates targets then startHudAction
economy.*                            # combatant turn budget (flags.illusive-dnd-5e.turn)
```

Deferred until their slices: `movement.preview/commit`, `vision.evaluate`, `lighting.perform`, `loot.perform`.

**Combat engine (authoritative):** [combat-engine.md](combat-engine.md) — ActionResolution FSM, hybrid reaction windows (hard pause vs soft sibling), irreversibility, registry, implementation slices R1+.

### Action lifecycle (v1)

```text
created → awaiting-attack → awaiting-damage-or-save → ready-to-apply → completed
                                                         ↘ cancelled | corrected
                         ↘ awaiting-reaction (hard window / OA) ↗
```

Leave-reach **OA** holds movement until Pass or a reaction resolves. Other rewrite reactions use **hard windows** on the parent (see combat-engine.md); pure retaliations (e.g. Hellish Rebuke) stay soft siblings.

---

## 7. Domain inventory — capabilities, exclusions, order

### Implementation order

1. **Combat v1** — HUD activity use, resolution tracking, explanation, correction stub  
2. **Movement v1** — path preview + commit + budget (reuse HUD movement ring)  
3. **Vision v1** — observer→target visibility result for HUD feedback  
4. **Lighting v1** — normalize scene lights; feed vision; keep HUD light presets as UI  
5. **Loot v1** — drop / pick up / transfer with permission checks  

### Combat

| In v1 | Stays manual / deferred |
|---|---|
| Launch item activity from HUD via dnd5e `activity.use` | Full class-feature / spell premade library |
| Combatant turn budget (`action`/`bonus`/`reaction` + basic flags) | |
| Resolution record + trace + HUD explanation strip | Per-spell special-case scripts beyond activity data |
| Save activities: auto saves, `damage.onSave`, effect profiles | Player-prompted save UX (always auto under full automation) |
| Opportunity attacks on leave-reach + held move + reaction prompt | Auto-fire OA without owner choice |
| Cover matrix into hit AC; long-range disadvantage | Obscurement / three-quarters soft adjudication UI |
| GM undo of recorded HP (+ economy refund) | Blind actor snapshot restore |
| Concentration check after damaging apply | |
| Death save button / concentration drop (existing HUD) | Merchants / CR treasure |

### Movement / pathfinding

| Later (order 2) | Excluded for now |
|---|---|
| Grid path preview, cost, Dash, undo (HUD already undoes) | 3D climb/ceiling traversal, DAS-style click-to-path |

### Vision

| Later (order 3) | Excluded for now |
|---|---|
| visible / not / indeterminate + factors | BG3-style faction vision cones productization |

### Lighting

| Later (order 4) | Notes |
|---|---|
| Domain lighting eval owned once; vision consumes it | HUD light presets remain presentation calling foundry token light updates |

### Loot

| Later (order 5) | Excluded for now |
|---|---|
| drop / pickup / transfer | Merchants, CR treasure tables, pickpocket minigame |

---

## 8. HUD control → application contract map

Controls map as follows.

### Action bar / mobile sheet (combat)

| Control | Current behavior | Owning API |
|---|---|---|
| Ability / activity click | `useActivityFromHud` | `application/activity` → `application/combat` → `foundry/dnd5e-adapter` |
| Target pick confirm | same | same |
| Economy gems (action/bonus/reaction) | toggle flags | `application/economy` |
| Death save | `actor.rollDeathSave` | stays foundry/actor until combat slice owns it |
| Drop concentration | combat-actions helper | `application/combat-actions` |
| Standard actions (dash/disengage/…) | standard-actions | `application/standard-actions` |
| Reaction prompt chrome | reaction-context | `application/reaction-context` (prompt only in v1) |

### Movement

| Control | Current behavior | Future owner |
|---|---|---|
| Movement mode / undo | `action-economy` / token updates | `application/movement` + `domain/movement` |
| Mobile step pad | `foundry/token-step` | same |
| Speed ring display | HUD read of token movement | view model from movement app |

### Lighting / aura / vision display

| Control | Current behavior | Future owner |
|---|---|---|
| Light presets | token light update in HUD util | `application` lighting perform → foundry |
| Aura picker | module flags + canvas paint | presentation + foundry flags |
| Passive vision summary | `foundry/actor-stats` | later `vision.evaluate` feed |

### Loot / inventory

| Control | Current behavior | Future owner |
|---|---|---|
| Item interactions / suitcase | `foundry/item-interactions` | `application/loot` |
| Mobile sheet inventory | sheet presentation | loot perform |

### Presentation-only (no domain)

Turn tracker, party rail, boss bar, camera pad, connection QR, mobile chrome, panel theme, layout.

---

## 9. Shared facts and subsystem ownership

| Fact / calculation | Owner | Consumers |
|---|---|---|
| Grid size, distance, unit conversion | `domain/spatial/grid` | movement, vision, range checks |
| Footprints, pixel distance | `domain/spatial/geometry` | movement, vision, activity range |
| Normalized walls/doors/tokens/lights | `foundry/scene-adapter` | movement, vision, lighting |
| Lighting evaluation | `domain/lighting` (order 4) | vision, HUD indicators |
| Visibility decision | `domain/vision` (order 3) | HUD, combat range/LOS assists |
| Path + move legality | `domain/movement` (order 2) | HUD movement, mobile step |
| Action resolution state | `domain/combat` | application/combat, HUD view |
| Rules edition context | `domain/rule-context` + `foundry/dnd5e-adapter.resolveRulesContext` | all rule-bearing procedures |
| Economy flags | `application/economy` on `flags.illusive-dnd-5e` | HUD gems, ability disable |

---

## 10. v1 combat rules matrix (first slice)

| id | Name | Edition | Source | Automation | Notes |
|---|---|---|---|---|---|
| `combat.activity-use` | Use item activity | system | dnd5e activity API | assisted | Rolls/damage via system; Illusive owns workflow + explanation |
| `combat.economy.action` | Action economy — Action | 2024 / system | PHB action economy (cite on expand) | assisted | Module flags |
| `combat.economy.bonus` | Action economy — Bonus | 2024 / system | same | assisted | |
| `combat.economy.reaction` | Action economy — Reaction | 2024 / system | same | assisted | Spend + hard/soft pause (see combat-engine.md) |
| `combat.range.check` | Activity range gate | convenience | Closest-square + elevation; melee/ranged/thrown bands | assisted | Long range allowed (band flagged); cover gate on attacks |
| `combat.opportunity-attack.2024` | Opportunity Attacks | 2024 | PHB 2024 glossary | assisted | Leave reach → reaction melee; Disengage / teleport / forced cancel |
| `combat.opportunity-attack.2014` | Opportunity Attacks | 2014 | PHB 2014 Combat | assisted | Same leave-reach; must see mover |
| `combat.cover.2024` | Cover | 2024 | PHB 2024 glossary | assisted | half +2 / ¾ +5; total blocks targeting |
| `combat.cover.2014` | Cover | 2014 | PHB 2014 Combat | assisted | Same bonus matrix; wall-ray sample |
| `combat.correction` | GM correction / undo | convenience | n/a | assisted | `appliedChanges` trail + `correctLastCompleted` |

Reaction timing, knock-out, soft cover, and sight-pair advantage are specified in [combat-engine.md](combat-engine.md) and recent combat backlog work. **Grappling** remains design-only — not in implementation order.

---

## 11. Public dnd5e hooks used (5.3.3)

| Hook | Use |
|---|---|
| `dnd5e.preUseActivity` | Optional cancel / annotate |
| `dnd5e.postUseActivity` | Complete resolution / refresh HUD |
| `dnd5e.rollAttackV2` / `dnd5e.postRollAttack` | Trace attack rolls into active resolution |
| `dnd5e.rollDamageV2` | Trace damage into active resolution |
| `dnd5e.rollDeathSave` / `V2` / `postRollDeathSave` | Existing HUD death-save UX |
| `preUpdateToken` | Opportunity attacks when leave-reach |

Prefer these public hooks; do not depend on other modules or private Foundry APIs.

---

## 12. What is automated vs manual (plain list)

**Automated now**

- Fire the selected activity from the HUD through dnd5e; track resolution (phase + roll trace + explanation); GM correction stub  
- Owned attack workflow: spend economy → `activity.use` → await attack → hit vs AC → damage → apply HP to hit tokens; record applied changes  
- Owned save workflow (DAS-like): roll saves vs activity DC → scale damage by `damage.onSave` (none/half/full) → apply activity effects by failed/saved/`onSave` profile  
- Action / bonus / reaction economy flags (reset on turn); reaction pause + persist/resume  
- Opportunity attacks on leave-reach → reaction prompt (Disengage / teleport / forced skip)  
- Hybrid reaction windows (hard pause for rewrite reactions; soft siblings for retaliations) — see [combat-engine.md](combat-engine.md)  
- Cover into AC/Dex (incl. soft ¾ GM prompt); obscurement / sight-pair attack mods; melee knock-out at 0 HP  
- Range / reach gate on HUD attacks (melee uses weapon reach, default 5 ft, square-grid distance)  
- Standard actions (Dash, Disengage, Dodge, Help, Hide, Ready)  
- Path preview / commit / undo with movement budget  
- Visibility + lighting evaluation for HUD feedback  
- Loot transfer / drop validate + apply  

**Still manual / not owned**

- Choosing tactics and most adjudication  
- Auto-firing opportunity attacks without the owner choosing  
- Ready-as-trigger, fall reactions, full class/spell premade libraries beyond dnd5e activity data  
- Merchants, CR treasure, climb/ceilings pathfinding, animations, homebrew authoring UI 

---

## 13. Vertical slices — status

Each slice: domain + application + foundry adapter + HUD/API surface.

| Slice | Status | Deliverable |
|---|---|---|
| **C1** | **Done** | Activity use → resolution → explanation strip → correct API |
| **C2** | **Done** | Persist/resume pending; reaction pause; scoped undo plan |
| **C3** | **Done** | Opportunity attacks (`preUpdateToken` leave-reach → reaction prompt) |
| **C4** | **Done** | Cover matrix (wall-ray sample → none/half/¾/total; attack gate + preview) |
| **R0+** | **See combat-engine.md** | Hybrid reaction windows + registry (slices R1–R5) |
| **M1** | **Done** | `movement.preview` / `commit` / `undoLastMove` (A* + budget) |
| **V1** | **Done** | `perception.evaluateVisibilityBetween` |
| **L1** | **Done** | `perception.performLighting` / `evaluateLightAt` feeds vision |
| **Q1** | **Done** | `loot.perform` transfer/drop validate + inventory adapter |

**Still not DAS-parity (explicit exclusions):** class/spell premade library (beyond dnd5e activity data), merchants/CR treasure, climb-ceilings, animations, homebrew authoring UI. Save/damage/effect orchestration for `SaveActivity` **is** in scope. Expand via new cited slices only.

---

## 14. Reference: Darshyne Automation Suite

Architecture lessons adopted (action state, trail, adapters, inspectable routes, persist-before-wait). Automation is always full. Feature scale is intentionally smaller than DAS Core.

---

## 15. Code architecture rules for Cursor

1. HUD stays presentation-only.  
2. No second rules engine inside the HUD.  
3. Do not add empty domain frameworks — extend an existing slice or open a cited new one.  
4. Cite rules when implementing rule-bearing behavior.  
5. If a behavior lacks a public integration point on dnd5e 5.3.3, report the gap before private APIs or a fork.  
6. Prefer vertical slices over horizontal scaffolding.

---

## 16. Discovery + delivery checklist

| Step | Status |
|---|---|
| 1. Inventory HUD; incorporate HUD | **Done** |
| 2. Capabilities, exclusions, order | **Done** (§7) |
| 3. HUD → application contract map | **Done** (§8) |
| 4. Record dnd5e version + hooks | **Done** — **5.3.3** |
| 5. Rules matrix for selected behaviors | **Done** (§10 + catalog) |
| 6. Shared facts / ownership | **Done** (§9) |
| 7. Implement vertical slices C1–C4, M1, V1, L1, Q1 | **Done** (§13) |
| Automation always full | **Done** (no level setting; all features on) |
| Inspectable hook router | **Done** (`diagnostics.listRoutes`) |
