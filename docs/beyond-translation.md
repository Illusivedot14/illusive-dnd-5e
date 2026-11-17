# Beyond

Combat does not read this payload. It reads Foundry actors.

Live in `src/dnd-beyond-sync/`: the vendored relay, character reads, condition ids 1 through 15, long rest and short rest write-back, and a Beyond dice roll shown as a Foundry chat roll. The relay sees ciphertext only. The field tables below are the payload map. A row that describes a future write is not a second implementation.

# D&D Beyond ↔ Foundry: data structures and module structure

## 0. Rules this design keeps

1. **The Foundry actor is the working copy.** The combat engine, HUD, phone sheet, and every other part of this module read dnd5e actors and items only. None of them read D&D Beyond data.
2. **D&D Beyond is tracked, not obeyed blindly.** Each field has one owner (§4.4). A sync only touches fields it owns.
3. **An actor must stay fully usable with sync off.** Sync writes inputs dnd5e already understands. It does not write values that turn off dnd5e's own calculation.
4. **One adapter.** All D&D Beyond knowledge lives in `src/dnd-beyond-sync/`. It produces plain Foundry-shaped data. Nothing outside that folder imports from it except `main.mjs`.
5. **ddb-importer is the reference, not a dependency.** Its code is not called. The flag data it already stored on documents is read (§4.2).

## 1. What the world has today

Checked in `secrets-of-sindral`, actors database:

- Every player actor was imported by ddb-importer. Each carries `flags.ddbimporter.dndbeyond.characterId`.
- Every embedded item on those actors carries `flags.ddbimporter.id`. Most also carry `definitionId`, `entityTypeId`, and `containerEntityId`.
- Each actor has one `class`, one `subclass`, one `race`, and one `background` item. The class item has a `HitPoints` advancement (`1: "max"`, then `"avg"` per level) and `hd.denomination` / `hd.spent`.
- `system.attributes.hp.max` is `null` on most of them. dnd5e calculates the maximum from class advancement, Constitution, and effects.
- Exceptions: **Balrus** `max: 102, tempmax: -6` and **Bucky** `max: 70`. This module's hit point sync wrote those numbers. A numeric `max` replaces dnd5e's calculation, so on those two the class advancement no longer counts. §8 fixes this.
- Several Beyond characters have two Foundry actors: `150019122` (Stumps, Tree), `149491494` (Brother Broccoli, Candi), `142140615` (Maraess, Annaess Eivalur), `156979240` (Mirena Easom, Eris). A link must be one character to one actor. The importer flag can suggest a link. It cannot decide one.

## 2. Source: the character GET

```
GET https://character-service.dndbeyond.com/character/v5/character/{id}?includeCustomItems=true
Authorization: Bearer {token from POST auth-service /v1/cobalt-token}
→ { id, success, message, data: Character, pagination }
```

`Character` holds **inputs and choices**. It does not hold the totals the D&D Beyond sheet shows: maximum hit points, ability totals, armor class, save bonuses, spell DC, and attack bonuses are all computed. Whatever needs a total either computes it or lets dnd5e compute it.

### 2.1 Sections

| Section | Shape | Notes |
|---|---|---|
| `id`, `name`, `userId`, `username`, `campaign` | scalars, `{ id, name, dmUserId, characters[] }` | `campaign.characters[]` lists every character in the campaign with `characterId`. Useful for the link menu |
| `dateModified`, `providedFrom` | ISO string, `"storage"` | Change detection. Skip a read when `dateModified` matches the last applied value |
| `inspiration`, `currentXp`, `alignmentId`, `lifestyleId` | scalars | |
| `baseHitPoints`, `bonusHitPoints`, `overrideHitPoints`, `removedHitPoints`, `temporaryHitPoints` | numbers or null | Rolled or averaged dice, the max modifier box, an override, damage taken, temporary hit points |
| `stats`, `bonusStats`, `overrideStats` | `[{ id: 1..6, value }]` | Base, manual bonus, and override per ability. Racial, feat, and item increases live in `modifiers` |
| `race` | `{ fullName, baseRaceName, entityRaceId, racialTraits[{ definition }], weightSpeeds, sizeId }` | |
| `background` | `{ definition: { id, name, featList, grantedFeats } }` or a custom background | |
| `classes[]` | `{ id, level, hitDiceUsed, isStartingClass, definition, subclassDefinition, classFeatures[{ definition, levelScale }] }` | `classes[].id` is the character-class id that spells point back to |
| `feats[]` | `{ componentId, componentTypeId, definition }` | |
| `options` | `{ race, class, background, item, feat }` each `[{ componentId, definition }]` | The option picked for a feature, for example "Increase two scores (+2 / +1)" |
| `choices` | `{ race, class, background, item, feat }` each `[{ id, componentId, type, subType, optionValue, optionIds }]`, plus `choiceDefinitions`, `definitionKeyNameMap` | Picks such as skill, ability score, and instrument. `optionValue` resolves through `choiceDefinitions[].options[].id` |
| `modifiers` | `{ race, class, background, item, feat, condition }` each `[Modifier]` | Every passive number |
| `actions` | `{ race, class, background, item, feat }` each `[Action]` | Usable things with `limitedUse`, `activation`, `range`, and save or attack data |
| `inventory[]` | `{ id, definition, quantity, equipped, isAttuned, chargesUsed, limitedUse, containerEntityId, containerEntityTypeId }` | `definition` is the item: `filterType`, `type`, `armorClass`, `damage`, `properties`, `grantedModifiers`, `canAttune`, `magic`, `rarity`, `weight` |
| `customItems`, `currencies` | `[]`, `{ cp, sp, ep, gp, pp }` | |
| `spells` | `{ race, class, background, item, feat }` each `[SpellEntry]` | Granted spells. `componentId` names the feature or item that grants it |
| `classSpells[]` | `{ characterClassId, spells[SpellEntry] }` | Spells known or prepared per class |
| `spellSlots[]`, `pactMagic[]` | `[{ level, used, available }]` | `available` is 0 in this response. dnd5e computes slot maximums |
| `conditions[]` | `[{ id, level }]` | Exhaustion carries a level |
| `deathSaves` | `{ failCount, successCount, isStabilized }` | |
| `creatures[]` | companions and summons on this sheet | Not monster stat blocks |
| `preferences` | `hitPointType` (1 fixed, 2 rolled), `encumbranceType`, … | `hitPointType` decides whether `baseHitPoints` is averaged or rolled |
| `customDefenseAdjustments`, `customSenses`, `customSpeeds`, `customProficiencies`, `customActions`, `characterValues` | arrays | Manual overrides typed on the sheet. Read last; they win |

**Modifier**: `{ id, type, subType, value, fixedValue, dice, statId, entityId, entityTypeId, isGranted, requiresAttunement, restriction, componentId, componentTypeId }`. `type` is `bonus`, `set`, `set-base`, `proficiency`, `expertise`, `advantage`, `resistance`, `immunity`, `sense`, and others. `subType` names the target, for example `constitution-score`, `hit-points-per-level`, `darkvision`. `isGranted: false` with a matching `choices.*[].componentId` means the player picked it. It still applies.

**SpellEntry**: `{ id, definition: { id, name, level, school, components[], concentration, ritual, duration, activation, range, saveDcAbilityId, attackType, atHigherLevels, modifiers, conditions }, prepared, alwaysPrepared, usesSpellSlot, countsAsKnownSpell, limitedUse, componentId, componentTypeId, castAtLevel, spellCastingAbilityId }`.

### 2.2 Ids

| Id | Where | Meaning |
|---|---|---|
| Instance id | `inventory[].id`, `classes[].id`, `SpellEntry.id`, `Action.id` | This character's copy. The match key for updates |
| Definition id | `*.definition.id` | The catalog entry, shared by every character |
| `definitionKey` | `"{entityTypeId}:{definitionId}"` | Globally unique catalog key |
| `entityTypeId` | every entity | What kind of thing. Character `1581111423`, class `1446578651`, class feature `12168134`, racial trait `1960452172`, feat `1088085227`, item `112130694`, spell `1118725998` |
| `componentId` + `componentTypeId` | modifiers, choices, actions, spells, options | The feature, feat, or item that granted this row. The join key |
| `characterClassId` | `classSpells[]` | Which `classes[].id` owns these spells |

### 2.3 Lookup tables

`GET https://www.dndbeyond.com/api/config/json` needs no login. It returns the numeric tables: `stats`, `conditions`, `damageTypes`, `activationTypes`, `spellComponents`, `aoeTypes`, `creatureSizes`, `monsterTypes`, `challengeRatings`, `limitedUseResetTypes`, `weapons`, `weaponProperties`, `armor`, `armorTypes`, `gearTypes`, `senses`, `movements`, `sources`, `abilitySkills`, `levelProficiencyBonuses`, `multiClassSpellSlots`, `pactMagicMultiClassSpellSlots`. Translators read ids through these tables and do not hard-code names. ddb-importer loads the same file into `CONFIG.DDB`.

## 3. Target: the dnd5e actor

### 3.1 Actor fields that matter

| Path | Notes |
|---|---|
| `system.abilities.{str..cha}.value` | Score. dnd5e derives modifier, save, and checks |
| `system.attributes.hp.{value,temp,tempmax,max,bonuses.level,bonuses.overall}` | `max: null` means dnd5e computes it from class `HitPoints` advancement + Constitution × level + `bonuses`. A number replaces that |
| `system.attributes.{inspiration,exhaustion,death.success,death.failure}` | |
| `system.details.xp.value` | |
| `system.currency.{cp,sp,ep,gp,pp}` | |
| `system.spells.spell1..spell9.value`, `system.spells.pact.value` | Remaining slots. Max comes from class spellcasting progression |
| `statuses` / ActiveEffects with a status | Conditions |

### 3.2 Item types

`class` (`levels`, `hd.denomination`, `hd.spent`, `spellcasting`, `advancement`), `subclass`, `race`, `background`, `feat` (`type.value` class / race / feat / background / monster), `spell` (`level`, `school`, `properties` vocal/somatic/material/concentration/ritual, `method`, `prepared`, `sourceItem`, `activation`, `range`, `target`, `duration`, `activities`), `weapon`, `equipment`, `consumable`, `tool`, `loot`, `container`. Usable items share `quantity`, `equipped`, `attunement` + `attuned`, `uses.max` + `uses.spent`, `container`, and `activities`.

## 4. Shared data structures

These are the agreement. Every translator, the read path, and the write path use them.

### 4.1 Link

On the actor:

```js
flags["illusive-dnd-5e"].beyond = {
  characterId: "172287274",   // D&D Beyond character id, string
  campaignId: "6846437",
  modified: "2026-11-15T03:30:28.021Z", // dateModified of the last applied read
  pulledAt: 1763177428000,              // when that read was applied
  sections: { hp: "a1f3", items: "9c02", spells: "e771" }, // hash of each source slice last applied
  reimport: ["Druid is level 10 on D&D Beyond and 9 in Foundry"] // structure changes found on the last read
};
```

The world setting `ddbCharacterMapping` (`{ characterId: actorId }`) stays as the menu index. On load, the module checks that both agree and that each character id appears on one actor only. Adding a link writes both.

`flags.ddbimporter.dndbeyond.characterId` is read only to pre-fill the menu's suggestion. Duplicate actors (§1) mean it cannot be trusted alone.

### 4.2 Item identity

Each embedded item that came from D&D Beyond is matched by:

```js
key = `${entityTypeId}:${instanceId}`
```

Read from the flags ddb-importer already stored, `flags.ddbimporter.entityTypeId` and `flags.ddbimporter.id`. Items this module creates later get the same two keys, plus `definitionId`, `componentId`, `componentTypeId`, and for spells `dndbeyond.characterClassId`. Keeping the importer's key names means the existing actors match without re-importing. No importer code runs.

| Beyond row | `entityTypeId` | instance id |
|---|---|---|
| `inventory[]` | `inventory[].entityTypeId` | `inventory[].id` |
| `classes[]` | `classes[].entityTypeId` | `classes[].id` |
| class feature | `definition.entityTypeId` | `definition.id` |
| racial trait | `definition.entityTypeId` | `definition.id` |
| `feats[]` | `definition.entityTypeId` | `definition.id` |
| spell | `SpellEntry.entityTypeId` | `SpellEntry.id` |
| action | `Action.entityTypeId` | `Action.id` |

Items with no key are Foundry-only. Sync never edits or deletes them.

### 4.3 BeyondView

Translators return a `BeyondView`. It is plain data, holds no Foundry documents, and can be tested in Node:

```js
/** @typedef {object} BeyondView */
{
  characterId: "172287274",
  modified: "2026-11-15T03:30:28.021Z",
  actor: {                       // flat Foundry paths this sync owns
    "system.attributes.hp.value": 96,
    "system.attributes.hp.temp": 0,
    "system.attributes.hp.tempmax": -6,
    "system.currency.gp": 3500
  },
  items: [                       // one per keyed Beyond row
    {
      key: "112130694:1107004926",
      type: "equipment",
      name: "Stone of Good Luck (Luckstone)",
      update: { "system.equipped": true, "system.attuned": true, "system.quantity": 1 }, // owned fields only
      create: null               // full item data when the actor has no item with this key yet
    }
  ]
}
```

**Read** = translate the GET into a `BeyondView`, diff it against the actor, and apply only the differences.
**Write** = diff the actor against the last applied `BeyondView` (rebuilt from the cached GET), keep only Shared fields (§4.4), and send them.

### 4.4 Field ownership

**Beyond** = read only. Foundry edits are overwritten on the next read. **Shared** = two-way. **Foundry** = never synced.

| Data | Foundry | Beyond | Owner | Today |
|---|---|---|---|---|
| Current hit points | `hp.value` | `removedHitPoints` (= Beyond max + tempmax − value) | Shared | Read and write |
| Temporary hit points | `hp.temp` | `temporaryHitPoints` | Shared | Read and write |
| Max hit point modifier | `hp.tempmax` | `bonusHitPoints` | Shared | Read and write |
| Maximum hit points | `hp.max` stays `null`. Class advancement + Constitution + feat effects | `baseHitPoints`, `overrideHitPoints` | Beyond via class items | Read sets `null` when the actor has a class item. A number only with no class item or a Beyond override |
| Hit dice spent | class `hd.spent` | `classes[].hitDiceUsed` | Shared | Read. Written after a Foundry rest |
| Ability scores | `abilities.*.value` | `stats` + `bonusStats` + chosen and granted `*-score` modifiers, or `overrideStats` | Beyond | — |
| Level, class, subclass | class `levels`, subclass item | `classes[]` | Beyond | Differences listed as re-import needed |
| XP | `details.xp.value` | `currentXp` | Shared | Read and write |
| Inspiration | `attributes.inspiration` | `inspiration` | Shared | Read and write |
| Death saves | `attributes.death.*` | `deathSaves` | Shared | Read and write |
| Exhaustion and conditions | `attributes.exhaustion`, statuses | `conditions[]` | Shared | Read and write |
| Currency | `currency.*` | `currencies` | Shared | Read and write |
| Spell slots used | `spells.spellN.value` (= max − used) | `spellSlots[].used`, `pactMagic[].used` | Shared | Read and write |
| Spell prepared | spell `prepared` | `SpellEntry.prepared` | Shared | — |
| Spells known | spell items | `classSpells`, `spells.*` | Beyond | Missing spells listed as re-import needed |
| Equipped, attuned | `equipped`, `attuned` | `inventory[].equipped`, `isAttuned` | Shared | Read and write |
| Quantity | `quantity` | `inventory[].quantity` | Shared | — |
| Item charges | `uses.spent` | `inventory[].limitedUse.numberUsed` | Shared | Read and write |
| Feature uses | `uses.spent` | `Action.limitedUse.numberUsed`, limited-use spells | Shared | Read and write |
| Items owned | keyed items | `inventory[]`, `customItems[]` | Beyond adds and removes keyed items | Added and removed items listed as re-import needed. Nothing is created or deleted |
| Name, portrait, biography | `name`, `img`, `details.*` | `name`, `decorations`, `traits`, `notes` | Beyond | — |
| Token, sheet layout, favorites | token, `favorites` | — | Foundry | — |
| Combat state | concentration effects, `flags.illusive-dnd-5e.*` (metamagic, workflow, ready) | — | Foundry | — |
| Items with no key | anything | — | Foundry | — |

## 5. A. Player reads and writes

### 5.1 Read

1. **When**: world ready; a link added or changed; the game-log socket reports `character-sheet/character-update` for a linked character. Dice events are ignored.
2. **Fetch**: `readBeyondCharacter` through the relay (§6.1) → raw `Character`.
3. **Skip** if `dateModified` equals `beyond.modified`.
4. **Translate**: `translateCharacter(character, { config, actor })` → `BeyondView`. One translator per section (§7). Each one reads only its slice.
5. **Diff and apply** in one batch: `actor.update(actorChanges, { illusiveBeyond: "read" })`, then `updateEmbeddedDocuments` / `createEmbeddedDocuments`. Items are deleted only when they are keyed and their key vanished from Beyond.
6. **Stamp** `beyond.modified`, `pulledAt`, and `sections`.

Only the active GM with the lowest user id runs reads, so two GMs never write the same actor.

### 5.2 Write

1. `updateActor` and `updateItem` hooks on a linked actor. Updates carrying `options.illusiveBeyond === "read"` are ignored. That stops a read from writing itself back.
2. Each actor waits 750 ms after its last change, then diffs against the last `BeyondView` and keeps Shared fields only.
3. Each changed field becomes one call (`state.mjs` `writeCalls`). The URLs come from D&D Beyond's own character sheet bundle (`media.dndbeyond.com/character-app/static/js/main.*.js`). Base `https://character-service.dndbeyond.com/character/v5/`, Bearer token from `cobalt-token`, and the sheet adds `characterId` to every body.

| Foundry | Beyond call | Body |
|---|---|---|
| `dnd5e.restCompleted` with `result.type === "long"`, sent first | `POST character/rest/long` | `{ resetMaxHpModifier: false, adjustConditionLevel: false }` |
| class `hd.spent`, after `dnd5e.restCompleted` | `POST character/rest/short` | `{ classHitDiceUsed: { [classId]: spent }, resetMaxHpModifier: false }` |
| `hp.value`, `hp.temp` | `PUT life/hp/damage-taken` | `{ removedHitPoints, temporaryHitPoints }` |
| `hp.tempmax` | `PUT life/hp/bonus` | `{ bonusHitPoints }` |
| `details.xp.value` | `PUT character/progression` | `{ currentXp }` |
| `attributes.inspiration` | `PUT character/inspiration` | `{ inspiration }` |
| `attributes.death.*` | `PUT life/death-saves` | `{ failCount, successCount }` |
| `currency.*` | `PUT inventory/currency` | `{ cp, sp, ep, gp, pp, destinationEntityTypeId: 1581111423, destinationEntityId: characterId }` |
| `spells.spellN` | `PUT spell/slots` | `{ levelN: used }` |
| `spells.pact` | `PUT spell/pact-magic` | `{ levelN: used }` |
| `attributes.exhaustion` | `PUT condition` / `DELETE condition` | `{ id: 4, level, totalHp }` / `{ id: 4 }` |
| statuses | `PUT condition` / `DELETE condition` | `{ id, level: null, totalHp }` / `{ id }` |
| feature `uses.spent`, limited-use spell `uses.spent` | `PUT action/limited-use` | `{ id, entityTypeId, uses }` |
| item `uses.spent` | `PUT inventory/item/charge` | `{ id, uses, charges }` |
| item `equipped` | `PUT inventory/item/equipped` | `{ id, value }` |
| item `attuned` | `PUT inventory/item/attuned` | `{ id, value }` |

Condition ids: 1 blinded, 2 charmed, 3 deafened, 4 exhaustion, 5 frightened, 6 grappled, 7 incapacitated, 8 invisible, 9 paralyzed, 10 petrified, 11 poisoned, 12 prone, 13 restrained, 14 stunned, 15 unconscious.

Hit dice have one route, the short rest, which also resets short-rest uses on Beyond. So hit dice go out only when Foundry finishes a rest.

A Foundry long rest runs Beyond's long rest first, so Beyond resets everything it tracks, including uses that are not linked in Foundry. Both options are off: the calls after it write Foundry's exact bonus maximum and exhaustion level. The sheet's dialog sends the same body (`recoverMaxHp` → `resetMaxHpModifier`, `recoverExhaustion` → `adjustConditionLevel`).

4. Calls for one character run one at a time, in order. Each call that succeeds updates the stored view, so a failed call is retried on the next change and the ones before it are not resent.
5. Beyond answers with a game-log `character-update`. The read that follows finds no difference.

ddb-importer sends its writes to its hosted proxy. This module calls D&D Beyond from the GM page, encrypted end to end (§6.1).

`removedHitPoints = Beyond max + hp.tempmax − hp.value`, using Beyond's maximum from the last read. A read of that result gives back the same current hit points, even when dnd5e's maximum differs from Beyond's. A difference is logged as `max-differs`.

### 5.3 Rolls

`dice/roll/fulfilled` from the game log becomes a Foundry chat message (`roll.mjs`), when the world setting `ddbShowRolls` is on (default). Each Beyond roll carries `diceNotation.set[]` (`dieType`, `count`, `operation` 1 keep lowest / 2 keep highest, `dice[].dieValue`), `diceNotation.constant`, `rollType`, `rollKind`, and `result.total`. It is rebuilt with `Roll.fromData` as evaluated `Die`, `OperatorTerm`, and `NumericTerm` terms holding Beyond's values, so nothing is re-rolled. Dice So Nice animates chat rolls with those values. The speaker is the linked actor, or `context.name`. `messageScope: "userId"` rolls are whispered to GMs. Shape source: Beyond20 `src/dndbeyond/page-scripts/message-broker.js`.

**Conflicts**: last change wins. While a write for a character is queued, reads for that character are skipped (`reason: "writing"`).

## 6. B. The server

### 6.1 Process

Nothing runs outside Foundry. D&D Beyond only answers `www.dndbeyond.com`, so the page cannot use the browser's `fetch`. The module ships [libcurl.js](https://github.com/ading2210/libcurl.js) (LGPL-3.0, unmodified) in `vendor/libcurl/`. It runs HTTP and TLS inside the GM page and sends the encrypted bytes over a WebSocket to a Wisp relay, which forwards them to D&D Beyond's TCP port. CORS does not apply, the page can set `Cookie` and `Authorization`, and the relay sees only the host name, timing, and ciphertext.

- Relay: world setting `ddbRelayUrl`, default `wss://wisp.mercurywork.shop/` (a public demo relay, 500 kB/s per IP). Any Wisp relay works.
- `fetch.mjs` loads libcurl once per page (about 1.6 MB) and exposes `beyondFetch(relay)`. Network failures throw `RelayError`.
- `beyond-api.mjs` holds the calls: `exchangeCobalt`, `readBeyondCharacter`, `writeBeyondCalls` (only the §5.2 routes).
- When the relay cannot be reached, the GM page retries every 10 seconds and the menu status says so.
- Planned: `api/config/json` and `monster-service.dndbeyond.com/v1/Monster?ids=…` through the same transport.

The Cobalt cookie stays in the world setting `ddbCobaltCookie`. It leaves the GM page only inside TLS to D&D Beyond.

### 6.2 Where each layer runs

```
D&D Beyond ◀──TLS in page, via Wisp relay──▶ GM page   auth, fetch, update. Raw JSON in and out
D&D Beyond ──WSS──▶ GM page              game-log events: character id only
GM page: transport → translate → diff → apply   (read)
GM page: hooks → diff → translate back → transport   (write)
Every client: reads the dnd5e actor only
```

### 6.3 Module folder layout

```
src/dnd-beyond-sync/
  index.mjs              register settings and menu, start on ready (GM)
  transport/
    fetch.mjs            libcurl.js load, beyondFetch through the relay
    beyond-api.mjs       auth, character read, write calls
    game-log.mjs         socket, token refresh
  schema/
    beyond.d.mjs         JSDoc typedefs for Character, Modifier, SpellEntry, Action, InventoryEntry
    config.mjs           id tables from api/config/json, cached per session
  link/
    actor-link.mjs       §4.1 flag and mapping index, duplicate check
    item-key.mjs         §4.2 key read and write
  translate/
    character.mjs        Character → BeyondView, calls the section translators
    abilities.mjs
    hit-points.mjs
    resources.mjs        currency, xp, inspiration, death saves, conditions, slots, hit dice
    classes.mjs          class, subclass, race, background items
    features.mjs         class features, racial traits, feats, actions, options
    spells.mjs
    inventory.mjs
    effects.mjs          Modifier → ActiveEffect changes
    monster.mjs          later
  sync/
    read.mjs             fetch, skip, translate, diff, apply
    write.mjs            hooks, debounce, diff, queue
    diff.mjs             BeyondView ↔ actor
  menu/                  menu.mjs, menu.hbs, menu.css
  debug.mjs
```

Translators are pure: `(slice, context) → Foundry data`. They never call `game`, `actor.update`, or the network. Tests feed them saved GET fixtures.

## 7. C. Shaping spells, items, features, and monsters

Each kind gets one translator. ddb-importer has the same split (`CharacterClassFactory`, `CharacterFeatureFactory`, `CharacterSpellFactory`, `DDBItem`, `DDBMonsterFactory`). Each translator produces a full `create` payload the first time and only owned fields on later reads (§4.3).

### 7.1 Class, subclass, race, background

| Beyond | Foundry |
|---|---|
| `classes[]` | `class` item: `levels` = `level`, `hd.denomination` = `d{definition.hitDice}`, `hd.spent` = `hitDiceUsed`, `spellcasting.ability` from `spellCastingAbilityId`, `advancement` `HitPoints` per level (`max` at level 1, `avg` after, or rolled values when `preferences.hitPointType` is 2) |
| `classes[].subclassDefinition` | `subclass` item, `classIdentifier` = class identifier |
| `race` | `race` item: size, creature type, `weightSpeeds.normal` → movement, `set-base darkvision` modifiers → senses |
| `background` | `background` item |

Hit point maximum comes from these items, not from a number on the actor. Flat and per-level hit point modifiers (Tough, Dwarven Toughness) become effects on their feature items. ddb-importer puts them on `system.attributes.hp.bonuses.overall` as `value * @classes.{class}.levels`.

### 7.2 Features

Sources: `classes[].classFeatures` (where `requiredLevel ≤ level`), `classes[].subclassDefinition.classFeatures`, `race.racialTraits`, `feats[]`, and the picked `options.*`.

- One `feat` item per feature. `type.value` is class, race, feat, or background.
- `actions.*` rows with the same `componentId` merge into that feature as activities: attack, save, or utility from `actionType`, `saveStatId`, `fixedSaveDc`, `dice`, `range`, and `activation`.
- `limitedUse` → `uses.max` (`maxUses`, or proficiency bonus when `useProficiencyBonus`), `uses.spent` = `numberUsed`, recovery from `resetType` through `limitedUseResetTypes`.
- `modifiers.*` rows with the same `componentId` become ActiveEffect changes on that feature: proficiencies, senses, resistances, ability and hit point bonuses.
- Hidden rows (`hideInSheet`) are skipped.

### 7.3 Spells

| Beyond list | Foundry `method` | `prepared` | Owner item |
|---|---|---|---|
| `classSpells[].spells` | `spell` (or `pact` for pact casters) | `prepared`; always when `alwaysPrepared` | class with `classes[].id === characterClassId` → `sourceItem` |
| `spells.class` | `spell`, always prepared | always | the granting class feature (`componentId`) |
| `spells.race`, `spells.feat`, `spells.background` | `innate` or `atwill` from `limitedUse` / `usesSpellSlot` | always | the granting feature |
| `spells.item` | `innate`, uses from `limitedUse` | always | the granting inventory item (`componentId`) |

Fields: `level`, `school` (D&D Beyond name → dnd5e key), `properties` from `components` (`spellComponents` table) plus `concentration` and `ritual`, `activation` from `activationTypes`, `range` and `target` from `range` / `aoeType`, `duration`, and activities from `requiresAttackRoll`, `requiresSavingThrow` + `saveDcAbilityId`, `damageEffect`, `healing`, and `atHigherLevels`.

A spell already in a dnd5e compendium with the same name and rules version is copied from the compendium first, so its activities match what this module's combat engine expects. Beyond fields then override `prepared`, `method`, `sourceItem`, and uses only.

### 7.4 Items

| `definition.filterType` / fields | Foundry type |
|---|---|
| Weapon, `attackType` set | `weapon`: damage, properties, range, mastery |
| Armor, `armorTypeId` set | `equipment` with armor type and `armorClass` |
| Shield | `equipment` shield |
| Potion, Scroll, `isConsumable` | `consumable` |
| `isContainer` | `container` |
| Tool by `gearTypeId` | `tool` |
| Wondrous item, Ring, Rod, Staff, Wand | `equipment` trinket, or `weapon` when it attacks |
| Everything else | `loot` |

Shared fields: `quantity`, `equipped`, `attuned` (+ `attunement` from `canAttune`), `uses.spent` from `chargesUsed`. `containerEntityId` pointing at another inventory row becomes `system.container` = that item's Foundry id. `grantedModifiers` become effects that only apply while equipped, and while attuned when `requiresAttunement`. Compendium copy first, same as spells.

### 7.5 Monsters

Monsters are not in the character GET. A stat block is its own document and becomes an `npc` actor:

- `flags["illusive-dnd-5e"].beyond = { monsterId }`
- abilities, `hp.value` / `hp.max` / formula, armor class, movement, senses, `details.cr` / type / size from `challengeRatings`, `monsterTypes`, and `creatureSizes`
- actions, bonus actions, reactions, legendary, and lair actions → `feat` items with `type.value: "monster"` and activities, through the same `features.mjs` activity builder used for player actions
- spellcasting → spell items through `spells.mjs`, matched to compendium spells

Read only. Combat changes on an NPC never go back to D&D Beyond. ddb-importer fetches monsters through its proxy (`/proxy/monster`, `/proxy/monsters/ids`). The D&D Beyond endpoint behind that is still unidentified, so `/monster` is not designed yet.

`character.creatures[]` (familiars, wild shapes) links a player to a monster id later. It does not change the player actor.

## 8. Changes to today's code

1. **Hit points**: done. Reads write `value`, `temp`, and `tempmax`, and set `max` to `null` on an actor with a `class` item. Balrus and Bucky go back to `null` on their next read. A numeric `max` is written only with no class item or a Beyond override.
2. **Link**: done. The menu writes `flags["illusive-dnd-5e"].beyond` with the mapping, removes it on unlink, and warns when a character or actor was already linked. Each read stamps `modified` and `pulledAt`. `sections` comes with the section translators.
3. **Relay**: done. `relay.user.js`, `inbox.html`, and `relay-client.mjs` are removed. `linkedCharacterIds` lives in `character-mapper.mjs`.
4. **Play state sync**: done. `state.mjs` translates both ways, `read.mjs` applies reads, `writeback.mjs` queues writes, and `writeBeyondCalls` sends them through the relay (§5.2, §6.1). Structure changes show in the menu as "Re-import needed with ddb-importer". Not yet tried against a live character.
5. **Layout**: move the current files into the §6.3 folders as each section translator is written.
6. **Fixtures**: save one GET per linked character under `test/fixtures/beyond/` with the cookie removed. Translators are tested against them.

## 9. Decisions

Agreed 2026-11-14.

1. **Item identity** reuses the ddb-importer flag keys (§4.2). Existing actors match without a re-import.
2. **Maximum hit points** come from class items. The sync writes `hp.value`, `hp.temp`, and `hp.tempmax`, and leaves `hp.max` at `null` (§8.1).
3. **First writes** are hit points only: `hitpoints` (current and temporary) and `hpbonus` (max modifier). Spell slots, hit dice, currency, inspiration, and equipment state come later. Adding or removing items on D&D Beyond from Foundry is out of scope.
4. **Duplicate actors**: only the actor picked in the D&D Beyond menu is linked. The other actor is left alone.
5. **Who builds actors**: ddb-importer, run by hand, builds and restructures actors (classes, level-ups, new items and spells). This module syncs play state only and never calls importer code. Our own translators (§7) are deferred.
6. **Next writes and reads**, after hit points: spell and pact slots, hit dice, feature uses and item charges, conditions and exhaustion, death saves and inspiration, currency and XP, equipped and attuned. Each write URL comes from the D&D Beyond sheet bundle, as for hit points (§5.2).
7. **Structure changes**: when Beyond has a level, item, or spell the actor lacks, the sync logs it and the menu shows "re-import needed". It creates nothing.
