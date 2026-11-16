# Illusive vs DAS · Core (`dnd5e-combat`) — strict engine comparison

**Generated:** 2026-11-16T22:08:59.797Z
**DAS version compared:** 0.283.0 (clone of https://github.com/Darshyne/dnd5e-combat)
**Illusive path:** `modules/illusive-dnd-5e`

## 0. Method (external authority only)

This document was built by reading these sources. It does not rely on remembered feature lists.

| Source | What it is | Used for |
|---|---|---|
| https://github.com/Darshyne/dnd5e-combat `README.md` | Project claim (2024 rules, Foundry 14, dnd5e 6.x, Midi-QOL exclusive) | Scope |
| https://github.com/Darshyne/dnd5e-combat `docs/reference/*` | Code-generated reference (`npm run reference`), tested | API, hooks, settings, content keys, moments |
| https://github.com/Darshyne/dnd5e-combat `docs/reference/surface.json` | Bare contract | API path count, moments |
| https://github.com/Darshyne/dnd5e-combat `module/scripts/content/*.mjs` | Shipped identifier tables | Per-item automation inventory |
| https://darshyne.github.io/automated.html | Published automation list (858 rules claimed on page) | Cross-check of covered spells/features/feats/monsters/items |
| Illusive `src/rules/catalog.mjs` | Rule IDs + automation status | What Illusive cites as covered |
| Illusive `src/content/declarations.mjs` | Shipped declarations | Identifier overlap |
| Illusive `src/domain/triggers/moments.mjs` | Moment vocabulary | Moment gap |
| Illusive `docs/combat-engine.md` | Engine design + own coverage section | Architecture + known partials |
| Illusive `src/application/**`, `src/domain/**` | File inventory | Subsystem presence |

Counts from extraction:

| Metric | DAS | Illusive |
|---|---:|---:|
| Content schema keys | 284 | n/a (uses declaration steps, not the same schema) |
| Moment→action pairs in CONTENT.md | 67 | n/a |
| Published moments (surface.json) | 29 | 35 |
| API paths | 356 | not enumerated as a single public combat API of this size |
| Settings | 128 | fewer (HUD + Beyond + combat settings, not 128) |
| Content identifiers in `content/*.mjs` | 791 | 193 match identifiers, 201 declaration ids |
| Identifiers in both (normalized) | 152 | 152 |
| Identifiers only in DAS | 639 | — |
| Match identifiers with no DAS content key of the same id | — | 41 |
| Rules catalog entries | — | 226 |

## 1. Verdict (from the counts above)

DAS · Core is a full combat-loop replacement (movement, vision, ethereal, content tables for hundreds of identifiers, 356 API paths, 128 settings). Illusive owns the reaction and resolution loop, undo, cover, opportunity attacks, range, and 193 match identifiers (201 declaration ids), plus the HUD and the D&D Beyond sync.

The content gap is still the dominant gap. **152 of DAS's 791 identifiers now have an Illusive declaration** (19%). The first extraction on this page counted 38. Sections 6.1–6.3 are that first list. The recount in section 6 is the current one.

Three DAS subsystems are still absent: summons, the ethereal plane, and doors and locks. Antimagic, short teleports, blocking circles, zone replay, Portent, and a Bardic die are present, with the limits in section 11.

## 2. Architecture

| Concern | DAS · Core (from README + reference) | Illusive (from combat-engine.md + tree) |
|---|---|---|
| Role | Owns the whole combat loop; mutually exclusive with Midi-QOL | Owns ActionResolution FSM + reactions + HUD; uses dnd5e activities/rolls |
| Automation levels | essentials / assisted / full | No equivalent three-level gate |
| Content model | Per-identifier entries with 284 schema keys; `api.content.register` | Declarations (`match` + `on` + `do` steps); catalog citations |
| Neighbour modules | UI / loot / light / animations / homebrew are separate repos | HUD, Beyond sync, animations live inside this module |
| Official content bias | Written for SRD 5.2 + premium Foundry ids; DDB items need replace/diagnostic | Match by identifier **and** name regex (DDB-friendly) |
| Public API | 356 paths in surface.json | Smaller; combat write gateway, reaction socket, Beyond sync |

## 3. Core subsystems (presence)

Presence means a dedicated module file or an explicit catalog/doc claim. "partial" means Illusive has some code/doc claim but DAS's surface is clearly broader.

| Subsystem | DAS evidence | Illusive evidence | Status |
|---|---|---|---|
| Attack resolution / hit / crit | `core/attack.mjs`, `core/criticals` settings, `core/d20.mjs` | `resolve-activity.mjs`, `dice.mjs`, catalog activity-use | both |
| Damage apply / resists / temp HP | `runtime/flow.mjs`, defenses | `damage-apply.mjs` | both |
| Saves (NPC auto / player screen) | README + `adapter/saves.mjs` | `save-resolve.mjs`, settle-save | both |
| Concentration | adapter/concentration | damage-apply trail | both |
| Reaction windows hard/soft | CONTENT triggers + flow settings | `reactions/window.mjs`, combat-engine §4–6 | both |
| Opportunity attacks before move | README + core movement | `opportunity-attack.mjs` + catalog | both |
| Cover | settings `cover`, `core/cover.mjs` | `cover.mjs` + catalog | both |
| Flanking (optional) | settings flanking* | `flanking.mjs` | both |
| Vision / light / Search | README, vision settings, illumination | `perception.mjs`; Night Spirit and Skulker read dim or dark | partial (DAS deeper: cone angles, faction vision, carried lights table) |
| Pathfinding / click-to-move | README BG3 movement, pathfind, clickToMove | `movement.path` catalog, token-movement, tabletop pilot | partial (Illusive has A* + tabletop; DAS owns combat click-move + climb system) |
| Climb / jump / fall | climb*, jump, falls settings | `falling.mjs`, Feather Fall / Slow Fall | partial |
| Ethereal plane | README + ethereal API/settings | not built | DAS only |
| Antimagic | core/runtime/adapter antimagic* | Globe and Antimagic Field circles in `zones.mjs` | partial (a circle, the slot is still spent, items are not suppressed) |
| Zones / lingering areas / walls | many content keys + zone* | `zones.mjs`: enter, turn, replay, blocking circles | partial (circles, not wall lines or cages of bars) |
| Auras | content `aura`, runtime auras | aura declarations + `aura-effects.mjs`, including speed | partial (save auras and Alacrity; Warding and Conquest do nothing) |
| Summons / familiars | content summon*, API summonOnTargets | not built | DAS only |
| Teleport handling | teleports.mjs + scenarios | Misty Step, Bait and Switch, dismissal | partial (beside a selected creature, a swap, or hidden and defeated) |
| Weapon masteries | settings masteryRules, core/mastery | `mastery.mjs`, content/masteries | both |
| Hit riders / smites / sneak | content hitRider, sneakAttack | hit-riders + declarations | both (Illusive fewer) |
| Metamagic | content metamagic | eight options on the cast | both (Illusive: those eight) |
| Wild Shape | core/wildshape | the sheet activity transforms; the step needs a chosen beast | partial |
| Ready action | core/ready | catalog + readied-triggers | both |
| Grapple / shove | README built-in | Grappler uses the grapple step | partial (DAS has the fuller contest) |
| Death saves / stabilize | core/death | knockout / rest paths | partial |
| Doors / locks | doors settings + API | not built | DAS only |
| Factions / disposition rules | factions API + settings | disposition helper only | DAS only |
| Group checks / GM requested rolls | group-roll | not found | DAS only |
| Legendary resistance | setting | the step and the action-bar button exist; no monster declaration ships it | partial |
| Portent | setting + core/portent | store on a rest; replace an attack or a save | both (ability checks are not replaced) |
| Hands / somatic components | hands adapter/settings | spell-components domain | partial |
| World diagnostic / Midi purge | README welcome + diagnostic | not found | DAS only |
| Content recipes / homebrew API | api.content.recipes | not found | DAS only |
| Float combat text / sounds | floats API | combat-fx partial | DAS only / Illusive thinner |
| Undo / correction | correction API | game-log undo + correction | both |
| Multiplayer reaction relay | player waits / flow | reaction-socket + write gateway | both |
| D&D Beyond live sync | diagnostic for DDB item replace only | full Beyond sync module | Illusive only |
| Mobile / action-bar HUD | neighbour `darsh-dnd-ui` | in-module HUD | Illusive owns UI here |

## 4. Moments

### 4.1 Illusive moments (`src/domain/triggers/moments.mjs`)

| Illusive moment | Related DAS CONTENT moments (from CONTENT.md moment column) | In DAS surface.moments? |
|---|---|---|
| `attackDeclared` | preAttackRoll, enemyAttacks, isAttacked | yes |
| `isHit` | isHit, allyIsHit | yes |
| `isMissed` | isMissed | yes |
| `damageKnown` | preDamageRoll | yes |
| `isDamaged` | isDamaged, allyIsDamaged | yes |
| `castsSpell` | castsSpell | yes |
| `savedSave` | savedSave | yes |
| `failedSave` | failedSave | yes |
| `checkSucceeded` | — | no |
| `falls` | falls, allyFalls | yes |
| `moves` | moves, enter | yes |
| `leavesReach` | — | yes |
| `hitDamage` | preDamageRoll, hit | yes |
| `weaponMastery` | — | no |
| `aura` | — | no |
| `turnStart` | startOfTurn, turnStart, atTurnStart | yes |
| `turnEnd` | endOfTurn, turnEnd | yes |
| `isTargeted` | isTargeted | yes |
| `preDamageRoll` | preDamageRoll | yes |
| `gainsCondition` | — | yes |
| `disengages` | enemyDisengages | yes |
| `rest` | — | no |

### 4.2 DAS published moments (surface.json) not named in Illusive MOMENTS

| DAS moment |
|---|
| `allyAttacks` |
| `enemyAttacked` |
| `enemyTurnEnd` |
| `originTurnStart` |

### 4.3 Every DAS moment→action pair (CONTENT.md)

| Moment | Action | Entries |
|---|---|---:|
| `allyAttacks` | `bonus` | 1 |
| `allyAttacks` | `use` | 1 |
| `allyIsDamaged` | `absorb` | 1 |
| `allyIsDamaged` | `use` | 1 |
| `allyIsHit` | `halve` | 1 |
| `allyIsHit` | `penalty` | 1 |
| `allyIsHit` | `reduce` | 2 |
| `allyIsHit` | `uncrit` | 1 |
| `allyIsHit` | `use` | 6 |
| `castsSpell` | `use` | 3 |
| `endOfTurn` | `damage` | 5 |
| `endOfTurn` | `remove` | 6 |
| `endOfTurn` | `resave` | 40 |
| `enemyAttacked` | `use` | 1 |
| `enemyAttacks` | `disadvantage` | 2 |
| `enemyAttacks` | `intercept` | 1 |
| `enemyAttacks` | `penalty` | 1 |
| `enemyAttacks` | `use` | 4 |
| `enemyDisengages` | `use` | 1 |
| `enter` | `replay` | 3 |
| `enter,turnEnd` | `replay` | 20 |
| `enter,turnStart` | `replay` | 2 |
| `failedSave` | `banish` | 2 |
| `failedSave` | `breakConcentration` | 2 |
| `failedSave` | `disarm` | 2 |
| `failedSave` | `lift` | 1 |
| `failedSave` | `mark` | 1 |
| `failedSave` | `move` | 11 |
| `failedSave` | `revertForm` | 1 |
| `failedSave` | `status` | 16 |
| `falls` | `cancel` | 1 |
| `falls` | `reduce` | 1 |
| `falls` | `use` | 2 |
| `falls,allyFalls` | `cancel` | 1 |
| `falls,allyFalls` | `use` | 1 |
| `hit` | `move` | 4 |
| `hit` | `status` | 5 |
| `isAttacked` | `disadvantage` | 3 |
| `isAttacked` | `use` | 3 |
| `isAttacked` | `ward` | 1 |
| `isDamaged` | `damage` | 1 |
| `isDamaged` | `remove` | 26 |
| `isDamaged` | `resave` | 6 |
| `isDamaged` | `use` | 10 |
| `isHit` | `damage` | 4 |
| `isHit` | `halve` | 4 |
| `isHit` | `miss` | 1 |
| `isHit` | `penalty` | 4 |
| `isHit` | `reduce` | 6 |
| `isHit` | `save` | 1 |
| `isHit` | `uncrit` | 1 |
| `isHit` | `use` | 17 |
| `isMissed` | `use` | 1 |
| `isTargeted` | `cancel` | 2 |
| `isTargeted` | `use` | 3 |
| `moves` | `replay` | 1 |
| `preAttackRoll` | `advantage` | 27 |
| `preAttackRoll` | `attackBonus` | 3 |
| `preAttackRoll` | `consume` | 10 |
| `preAttackRoll` | `disadvantage` | 29 |
| `preDamageRoll` | `damage` | 35 |
| `savedSave` | `mark` | 1 |
| `savedSave` | `move` | 1 |
| `startOfTurn` | `damage` | 11 |
| `startOfTurn` | `resave` | 7 |
| `turnEnd` | `replay` | 2 |
| `turnStart` | `replay` | 2 |

## 5. DAS content schema keys (all 284)

Illusive does not use this schema. Each key is a capability DAS can attach to an identifier. Treat a key Illusive lacks as a **capability gap**, even when Illusive covers a few items that would use it via custom steps.

| Key | DAS entries using it | Illusive has analogous step/feature? (conservative) |
|---|---:|---|
| `absorb` | 1 | yes absorb-elements / ward? |
| `actionEnds` | 19 | partial |
| `actionOrBonus` | 5 | partial economy |
| `advantageIfFighting` | 6 | no |
| `afterSmite` | 1 | no |
| `afterSneak` | 1 | no |
| `afterTeleport` | 2 | no |
| `antimagicZone` | 2 | no |
| `atTurnStart` | 3 | partial — turnStart moment |
| `atZero` | 3 | no |
| `aura` | 16 | partial — few auras |
| `avoidance` | 1 | no |
| `backfire` | 1 | no |
| `banishes` | 3 | no |
| `barrier` | 15 | no |
| `basicActions` | 11 | partial standard-actions |
| `blessedHealer` | 1 | no |
| `blink` | 1 | no |
| `blocksHealing` | 4 | no |
| `bolt` | 1 | no |
| `bonusAttack` | 1 | no |
| `breaksOn` | 12 | partial |
| `breaksOnActivity` | 1 | no Illusive schema equivalent found |
| `breaksOnOrigin` | 1 | no Illusive schema equivalent found |
| `brutalStrike` | 3 | no |
| `burns` | 1 | partial oil |
| `burst` | 3 | partial |
| `byWounds` | 1 | no |
| `cantripRange` | 1 | no |
| `carriedLight` | 13 | no |
| `castDuration` | 1 | no |
| `casterPulse` | 6 | no |
| `castTargets` | 1 | no |
| `catalyst` | 1 | no |
| `cellWall` | 2 | no |
| `chain` | 1 | no |
| `checkPoses` | 1 | no |
| `choice` | 22 | partial — HUD choices |
| `climbsOnTurn` | 1 | no |
| `coats` | 1 | no |
| `combatInspiration` | 1 | no |
| `commandStrike` | 1 | no |
| `compels` | 1 | no Illusive schema equivalent found |
| `concentrationBreaker` | 1 | partial |
| `confusion` | 1 | no |
| `counter` | 2 | partial counterspell |
| `coverThrough` | 3 | partial — cover |
| `critFeeds` | 1 | no |
| `critMark` | 2 | no |
| `critMove` | 1 | no |
| `cunningStrikeMax` | 1 | no |
| `cunningStrikes` | 3 | no |
| `cures` | 14 | partial |
| `curesAll` | 7 | no |
| `curesOn` | 5 | no |
| `damageShield` | 2 | no |
| `dataFixes` | 76 | no — DAS premium data fixes |
| `devours` | 1 | no Illusive schema equivalent found |
| `difficultTerrain` | 16 | partial — web |
| `discharge` | 1 | no |
| `discipleOfLife` | 1 | no |
| `dispel` | 1 | no |
| `drain` | 9 | no |
| `drawsOnEnd` | 1 | no |
| `dropsEffects` | 2 | no |
| `duplicates` | 1 | no |
| `durationByLevel` | 1 | no |
| `duringRage` | 4 | no |
| `effectChanges` | 22 | partial |
| `effectDurations` | 6 | partial special-duration |
| `effectEnds` | 46 | partial — special duration |
| `effectsExpire` | 2 | partial |
| `effectsFirst` | 1 | no |
| `effectsIf` | 6 | partial |
| `effectStatuses` | 6 | partial |
| `effectThen` | 1 | no |
| `effectWhile` | 10 | partial |
| `elementalAdept` | 1 | no |
| `elusive` | 1 | no |
| `emanation` | 16 | partial templates |
| `empower` | 1 | no |
| `enchantTarget` | 4 | no |
| `encloses` | 3 | no |
| `endActivity` | 1 | no |
| `endsCurses` | 2 | no |
| `endsOnUse` | 1 | no |
| `endsOwnConditions` | 1 | no |
| `endsWhen` | 31 | partial |
| `endurance` | 1 | no |
| `enterOnPose` | 2 | partial |
| `etherealShift` | 2 | no |
| `evasion` | 2 | no dedicated |
| `exclusiveWeapon` | 3 | no |
| `extraFirstTurn` | 1 | no |
| `fadesOnLongRest` | 2 | partial |
| `failMargins` | 2 | no |
| `flammable` | 2 | partial oil |
| `fleeOnFailedSave` | 1 | no |
| `fleetStep` | 1 | no |
| `flurry` | 3 | no |
| `flurryStrikes` | 1 | no |
| `forcedAttack` | 1 | no |
| `formLock` | 1 | partial |
| `fortifiedHealing` | 1 | no |
| `fortitude` | 1 | no |
| `freeSomatic` | 1 | partial hands |
| `globe` | 2 | no |
| `gmAlert` | 48 | no |
| `grants` | 1 | no |
| `grantsAction` | 1 | no |
| `grantsConditionImmunities` | 3 | partial auras |
| `grantsResistances` | 2 | partial |
| `grantsSpeeds` | 5 | no |
| `grappleDamage` | 1 | see subsystem table / no dedicated Illusive schema key |
| `greatWeaponFighting` | 1 | no |
| `halfOnMiss` | 2 | no |
| `haltOnReaction` | 1 | partial — Sentinel not shipped |
| `hardToPerceive` | 1 | no |
| `healingRerolls` | 1 | no |
| `healMax` | 1 | no |
| `healPool` | 4 | no |
| `healsDownedMax` | 1 | no |
| `heroicWarrior` | 1 | no |
| `hitDefense` | 1 | no |
| `hitDiceHeal` | 1 | no |
| `hitRider` | 20 | yes — hit riders / declarations |
| `holdsStill` | 1 | no |
| `hpTiers` | 3 | no |
| `ignoresResistance` | 4 | no |
| `includesOrigin` | 3 | no |
| `initiativeSwap` | 1 | no |
| `interposeShield` | 1 | no |
| `jump` | 5 | partial |
| `keepsConcentration` | 1 | no |
| `keepsProne` | 2 | no |
| `keepsSpeed` | 1 | no |
| `killsAtZero` | 1 | no |
| `kindles` | 1 | no |
| `knownToOrigin` | 1 | no |
| `lastStandHeal` | 1 | no |
| `leap` | 1 | no |
| `leash` | 1 | no |
| `leavesEffects` | 1 | no |
| `levitate` | 1 | no |
| `lifesteal` | 2 | no |
| `light` | 14 | partial — Foundry lights, not content table |
| `limitedAction` | 1 | no |
| `magical` | 22 | no |
| `magicEvasion` | 1 | no |
| `martialArts` | 1 | no |
| `maxSpellDamageVs` | 1 | no |
| `metamagic` | 6 | partial |
| `minRange` | 2 | partial range |
| `movable` | 3 | partial — moonbeam |
| `movesAfter` | 2 | see subsystem table / no dedicated Illusive schema key |
| `noActions` | 1 | no |
| `noAttacksOrSpells` | 1 | no Illusive schema equivalent found |
| `noBonus` | 2 | no |
| `noDamage` | 10 | no |
| `noOpportunity` | 18 | partial — OA cancel paths |
| `noOpportunityAttacks` | 4 | partial |
| `noRangedWeapons` | 1 | no |
| `noReactions` | 6 | partial reaction state |
| `noSpells` | 1 | no |
| `notOnSlippery` | 1 | no |
| `obscures` | 9 | no |
| `oneAttack` | 1 | no |
| `onFell` | 1 | partial dark ones blessing |
| `onHit` | 1 | partial |
| `onNatural1` | 6 | no |
| `onUsesSpent` | 6 | no |
| `openHand` | 1 | no |
| `opportunityDisadvantage` | 2 | no |
| `orders` | 1 | no |
| `overwhelmingStrike` | 1 | no |
| `pact` | 1 | no Illusive schema equivalent found |
| `panic` | 2 | no |
| `peerlessAim` | 1 | no |
| `pendingDie` | 2 | no |
| `persistentRage` | 1 | no |
| `pickTargets` | 12 | partial — targeting |
| `piercer` | 1 | no |
| `placesSummons` | 6 | no |
| `pointWall` | 5 | no |
| `portent` | 2 | no |
| `potentCantrip` | 1 | no |
| `potionEffect` | 2 | no Illusive schema equivalent found |
| `prismatic` | 2 | no |
| `projectiles` | 4 | partial |
| `quickSearch` | 1 | no |
| `quickStand` | 1 | no |
| `quietPose` | 2 | no |
| `rage` | 1 | partial via dnd5e/effects |
| `rangedDefense` | 2 | no |
| `rangedFeat` | 4 | no |
| `ranges` | 19 | yes — range gate |
| `reactions` | 1 | yes — reaction economy |
| `reactiveSpell` | 1 | partial — War Caster not declared as DAS key |
| `reactiveStrike` | 1 | partial — Polearm Master not shipped |
| `recast` | 6 | no |
| `recastCost` | 1 | no |
| `reckless` | 1 | no dedicated |
| `regainOnInitiative` | 5 | no |
| `regainOnShortRest` | 2 | partial rest |
| `regeneration` | 1 | no |
| `relentless` | 1 | no |
| `replacesAttack` | 7 | no |
| `rerollInitiative` | 1 | no Illusive schema equivalent found |
| `resize` | 2 | no |
| `retort` | 1 | no |
| `revealsInvisible` | 2 | no |
| `revivesFull` | 2 | no |
| `ritualAdept` | 1 | no |
| `rollBonus` | 18 | partial |
| `rolledAc` | 2 | no |
| `savageAttacker` | 2 | no |
| `saveAdvantage` | 20 | partial |
| `saveAdvantageFrom` | 1 | partial |
| `saveAdvantageSize` | 1 | no |
| `saveAutoSuccess` | 3 | no |
| `saveDamage` | 8 | partial |
| `savedEffects` | 6 | partial save activity |
| `saveDisadvantageFor` | 3 | no |
| `scatter` | 2 | partial caltrops |
| `scoreFloor` | 1 | no |
| `sculptSpells` | 1 | no |
| `searchBonus` | 2 | no |
| `seesInvisible` | 1 | no |
| `seesThroughOwnDarkness` | 1 | no |
| `selfZone` | 4 | partial |
| `sharesSpace` | 7 | no |
| `silences` | 1 | no |
| `singleAttack` | 1 | no |
| `slippery` | 2 | no |
| `slotRecovery` | 1 | no |
| `smite` | 11 | partial — Divine Smite rider |
| `sneakAttack` | 1 | yes |
| `sneakBonus` | 1 | see subsystem table / no dedicated Illusive schema key |
| `sniper` | 1 | no |
| `spellDamageTypes` | 2 | no |
| `spellFailure` | 1 | no |
| `spellRecall` | 1 | no |
| `spellsInAttack` | 3 | no |
| `stabilizes` | 1 | partial |
| `stableAtZero` | 1 | no |
| `standsWithReaction` | 1 | no |
| `storm` | 1 | no |
| `studiedAttacks` | 1 | no |
| `stunningStrike` | 1 | no |
| `summon` | 64 | no dedicated table |
| `summonEffectsOnCaster` | 1 | no |
| `supremeHealing` | 1 | no |
| `swallow` | 2 | no |
| `swapPlaces` | 1 | no |
| `sweep` | 1 | no |
| `swornEnemy` | 1 | no |
| `targetedSummon` | 1 | no |
| `targets` | 27 | no Illusive schema equivalent found |
| `teleport` | 8 | no |
| `tempHpPool` | 1 | partial |
| `tether` | 1 | no |
| `thinWall` | 5 | no |
| `thrownDamage` | 1 | no Illusive schema equivalent found |
| `trace` | 7 | no |
| `transpose` | 1 | no |
| `triggers` | 269 | yes — declarations `on`/`do` |
| `untypedDamage` | 2 | no |
| `upkeep` | 1 | no |
| `usageLimits` | 11 | partial uses |
| `wallAura` | 1 | no |
| `walls` | 7 | no |
| `wallSide` | 1 | no |
| `wardsAtZero` | 1 | no |
| `wardsConditions` | 1 | partial PfEaG |
| `willingFails` | 4 | no |
| `windward` | 1 | no |
| `wrath` | 2 | no |
| `zoneAffects` | 16 | partial — zones |
| `zoneBound` | 1 | no |
| `zoneCharges` | 1 | no |
| `zoneEffects` | 3 | partial |
| `zoneEnd` | 1 | no |
| `zoneLasts` | 2 | no |
| `zoneMax` | 2 | no |

## 6. Identifier coverage

### 6.0 Recount (current)

Counted from `src/content/declarations.mjs` against the 791 DAS identifiers already listed in 6.1 and 6.3. Sections 6.1–6.3 were not rewritten. An identifier in 6.3 that also appears in the gained list below is no longer missing.

| | Count |
|---|---:|
| DAS identifiers in this document | 791 |
| Illusive match identifiers | 193 |
| In both | 152 |
| Gained since the first extraction | 117 |
| Still only in DAS | 639 |
| Illusive match identifiers with no DAS key of the same id | 41 |
| Moments | 35 |
| Catalog rules | 226 |

The 117 gained identifiers are: action-surge, alert, ambush, antilife-shell, antimagic-field, arcane-ward, assassinate, aura-of-alacrity, aura-of-warding, bait-and-switch, blade-barrier, blade-ward, blinding-smite, blindness-deafness, boon-of-combat-prowess, boon-of-energy-resistance, boon-of-fate, boon-of-fortitude, boon-of-irresistible-offense, boon-of-recovery, boon-of-speed, boon-of-spell-recall, boon-of-the-night-spirit, brutal-strike, calm-emotions, cause-fear, charger, charm-monster, charm-person, circle-of-power, cloud-of-daggers, cloudkill, command, commanders-strike, commanding-presence, compulsion, confusion, contagion, crown-of-madness, crusher, cunning-strike, defense, disarming-attack, dispel-evil-and-good, distracting-strike, dominate-beast, dominate-monster, dominate-person, dread-ambusher, dueling, elemental-adept, ensnaring-strike, entangle, evards-black-tentacles, evasive-footwork, fear, feinting-attack, flesh-to-stone, forcecage, globe-of-invulnerability, goading-attack, grappler, grease, greater-portent, haste, hideous-laughter, hold-monster, hold-person, hunger-of-hadar, illusory-self, indomitable, insect-plague, instinctive-pounce, lucky, lunging-attack, mage-slayer, maneuvering-attack, menacing-attack, misty-step, observant, open-hand-technique, pack-tactics, piercer, poisoner, polearm-master, portent, power-word-kill, power-word-stun, precision-attack, projected-ward, pushing-attack, rally, relentless-rage, remarkable-athlete, repelling-blast, sentinel, shield-master, skulker, slasher, sleet-storm, slow, speedy, spike-growth, steady-aim, stinking-cloud, studied-attacks, stunning-strike, suggestion, sweeping-attack, tactical-mind, tactical-shift, tavern-brawler, unarmed-fighting, wall-of-fire, wall-of-force, wall-of-stone, warding-flare.

Three of the original 38 are still shipped and are not in the 152, because they match an effect name rather than an item identifier: armor-of-agathys, blur, and protection-from-evil-and-good. 38 − 3 + 117 = 152.

Sharing an identifier is not the same behavior. Evasive Footwork, Aura of Warding, and Aura of Conquest are in the gained list and do not apply their mechanical effect. Section 11 says what each named rule does.

### 6.1 In both engines (normalized id match)

This list is the first extraction (38 identifiers). The current overlap is the 152 in section 6.0.

| Identifier |
|---|
| `absorb-elements` |
| `armor-of-agathys` |
| `aura-of-courage` |
| `aura-of-devotion` |
| `aura-of-life` |
| `aura-of-protection` |
| `aura-of-purity` |
| `blur` |
| `caltrops` |
| `countercharm` |
| `counterspell` |
| `cutting-words` |
| `defensive-duelist` |
| `deflect-attacks` |
| `divine-fury` |
| `divine-smite` |
| `eldritch-smite` |
| `feather-fall` |
| `heavy-armor-master` |
| `hellish-rebuke` |
| `hex` |
| `hunters-mark` |
| `interception` |
| `moonbeam` |
| `oil` |
| `parry` |
| `protection` |
| `protection-from-evil-and-good` |
| `retaliation` |
| `riposte` |
| `shield` |
| `slow-fall` |
| `sneak-attack` |
| `spirit-guardians` |
| `stones-endurance` |
| `storms-thunder` |
| `uncanny-dodge` |
| `web` |

### 6.2 Illusive declaration ids with no DAS content key of the same id

These are often aliases (`deflect-missiles`), synthetic ids (`moonbeam-move`), or content DAS stores under another id.

| Illusive id |
|---|
| `armor-of-agathys-end` |
| `colossus-slayer` |
| `dark-one-s-blessing` |
| `dark-ones-blessing` |
| `deflect` |
| `deflect-energy` |
| `deflect-missiles` |
| `heavy-armor-master-2014` |
| `heavy-armor-master-2024` |
| `moonbeam-move` |
| `protection-from-evil-and-good-ward` |
| `silvery-barbs` |
| `superior-hunter-s-defense` |
| `superior-hunters-defense` |
| `wrath-of-the-storm` |

### 6.3 Missing in Illusive, by DAS content file

Every identifier listed under a file is present in DAS `module/scripts/content/` and absent from Illusive declarations (after alias normalization).

#### `absorbs.mjs` — 1 missing (of 1 in file)

| Identifier |
|---|
| `arcane-ward` |

#### `actions.mjs` — 12 missing (of 12 in file)

| Identifier |
|---|
| `activity` |
| `dash` |
| `disengage` |
| `dodge` |
| `effects` |
| `escape` |
| `help` |
| `hide` |
| `improvised` |
| `ready` |
| `search` |
| `unarmed` |

#### `auras.mjs` — 8 missing (of 11 in file)

| Identifier |
|---|
| `aura-of-authority` |
| `aura-of-bravery` |
| `circle-of-power` |
| `crusaders-mantle` |
| `grant-save-advantage` |
| `holy-aura` |
| `marshal-undead` |
| `pass-without-trace` |

#### `barbarian.mjs` — 21 missing (of 23 in file)

| Identifier |
|---|
| `aspect-of-the-wilds` |
| `brutal-strike` |
| `do` |
| `fanatical-focus` |
| `frenzy` |
| `if` |
| `improved-brutal-strike` |
| `improved-brutal-strike-2` |
| `indomitable-might` |
| `instinctive-pounce` |
| `intimidating-presence` |
| `mindless-rage` |
| `persistent-rage` |
| `primal-knowledge` |
| `rage` |
| `rage-of-the-wilds` |
| `reckless-attack` |
| `relentless-rage` |
| `triggers` |
| `triggers` |
| `vitality-of-the-tree` |

#### `bard.mjs` — 5 missing (of 7 in file)

| Identifier |
|---|
| `combat-inspiration` |
| `font-of-inspiration` |
| `leading-evasion` |
| `superior-inspiration` |
| `valor-extra-attack` |

#### `bursts.mjs` — 10 missing (of 10 in file)

| Identifier |
|---|
| `aura-of-vitality` |
| `beguiling-twist` |
| `eldritch-blast` |
| `heat-metal` |
| `ice-knife` |
| `magic-missile` |
| `phantasmal-force` |
| `protection-from-poison` |
| `scorching-ray` |
| `steel-wind-strike` |

#### `cantrips.mjs` — 13 missing (of 13 in file)

| Identifier |
|---|
| `chill-touch` |
| `friends` |
| `mage-hand` |
| `mind-sliver` |
| `minor-illusion` |
| `ranges` |
| `ray-of-frost` |
| `shocking-grasp` |
| `starry-wisp` |
| `toll-the-dead` |
| `triggers` |
| `true-strike` |
| `vicious-mockery` |

#### `choices.mjs` — 16 missing (of 17 in file)

| Identifier |
|---|
| `beguiling-magic` |
| `blindness-deafness` |
| `calm-emotions` |
| `contagion` |
| `dominate-mind` |
| `elemental-epitome` |
| `enhance-ability` |
| `enlarge-reduce` |
| `eyebite` |
| `fire-shield` |
| `guidance` |
| `imprisonment` |
| `potion-of-resistance` |
| `protection-from-energy` |
| `resistance` |
| `unarmed-strike` |

#### `cleric.mjs` — 18 missing (of 18 in file)

| Identifier |
|---|
| `avatar-of-battle` |
| `blessed-healer` |
| `blessed-strikes` |
| `blessing-of-the-trickster` |
| `channel-divinity` |
| `channel-divinity-cleric` |
| `disciple-of-life` |
| `do` |
| `do` |
| `if` |
| `improved-warding-flare` |
| `preserve-life` |
| `sear-undead` |
| `supreme-healing` |
| `tricksters-transposition` |
| `upgrade` |
| `war-priest` |
| `warding-flare` |

#### `defenses.mjs` — 2 missing (of 2 in file)

| Identifier |
|---|
| `effects` |
| `resistance` |

#### `druid.mjs` — 19 missing (of 19 in file)

| Identifier |
|---|
| `after` |
| `bearers` |
| `cosmic-omen` |
| `do` |
| `do` |
| `do` |
| `elemental-fury` |
| `full-of-stars` |
| `if` |
| `improved-circle-forms` |
| `improved-elemental-fury` |
| `lunar-form` |
| `moonlight-step` |
| `natures-ward` |
| `stormborn` |
| `teleport` |
| `trace` |
| `triggers` |
| `wrath-of-the-sea` |

#### `emanations.mjs` — 17 missing (of 17 in file)

| Identifier |
|---|
| `death-burst` |
| `death-throes` |
| `deathless-agility` |
| `deathly-stench` |
| `fear-aura` |
| `fetid-aura` |
| `fire-aura` |
| `flame-aura` |
| `gibbering` |
| `heat-aura` |
| `nimble-escape` |
| `shadow-stealth` |
| `sickening-vapors` |
| `stench` |
| `terrifying-aura` |
| `vile-appearance` |
| `viral-aura` |

#### `endings.mjs` — 6 missing (of 7 in file)

| Identifier |
|---|
| `banishing-smite` |
| `banishment` |
| `compelled-duel` |
| `mage-armor` |
| `rage` |
| `warding-bond` |

#### `feats.mjs` — 43 missing (of 46 in file)

| Identifier |
|---|
| `alert` |
| `athlete` |
| `boon-of-combat-prowess` |
| `boon-of-energy-resistance` |
| `boon-of-fate` |
| `boon-of-fortitude` |
| `boon-of-irresistible-offense` |
| `boon-of-recovery` |
| `boon-of-speed` |
| `boon-of-spell-recall` |
| `boon-of-the-night-spirit` |
| `changes` |
| `charger` |
| `crossbow-expert` |
| `crusher` |
| `defense` |
| `dueling` |
| `elemental-adept` |
| `grappler` |
| `healer` |
| `improved-illusions` |
| `lucky` |
| `mage-slayer` |
| `medium-armor-master` |
| `observant` |
| `piercer` |
| `poisoner` |
| `polearm-master` |
| `savage-attacker` |
| `sentinel` |
| `sharpshooter` |
| `shield-master` |
| `skulker` |
| `slasher` |
| `soldier-feature` |
| `speedy` |
| `spell-sniper` |
| `tavern-brawler` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `unarmed-fighting` |

#### `fighter.mjs` — 39 missing (of 41 in file)

| Identifier |
|---|
| `action-surge` |
| `ambush` |
| `bait-and-switch` |
| `commanders-strike` |
| `commanding-presence` |
| `disarming-attack` |
| `distracting-strike` |
| `evasive-footwork` |
| `feinting-attack` |
| `goading-attack` |
| `great-weapon-fighting` |
| `heroic-warrior` |
| `improved-war-magic` |
| `indomitable` |
| `lunging-attack` |
| `maneuvering-attack` |
| `menacing-attack` |
| `parry-maneuver` |
| `precision-attack` |
| `psionic-power` |
| `pushing-attack` |
| `rally` |
| `remarkable-athlete` |
| `studied-attacks` |
| `sweeping-attack` |
| `tactical-assessment` |
| `tactical-mind` |
| `tactical-shift` |
| `thrown-weapon-fighting` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `trip-attack` |
| `war-magic` |

#### `gear.mjs` — 25 missing (of 27 in file)

| Identifier |
|---|
| `alchemists-fire` |
| `ball-bearings` |
| `boots-of-striding-and-springing` |
| `bullseye-lantern` |
| `candle` |
| `cloak-of-arachnida` |
| `elixir-of-health` |
| `flammable` |
| `healers-kit` |
| `hooded-lantern` |
| `lamp` |
| `lantern-bullseye` |
| `lantern-hooded` |
| `potion-of-animal-friendship` |
| `potion-of-climbing` |
| `potion-of-diminution` |
| `potion-of-flying` |
| `potion-of-growth` |
| `potion-of-heroism` |
| `potion-of-vitality` |
| `slippers-of-spider-climbing` |
| `targets` |
| `tinderbox` |
| `torch` |
| `triggers` |

#### `gm-alerts.mjs` — 30 missing (of 31 in file)

| Identifier |
|---|
| `abjure-foes` |
| `antilife-shell` |
| `antimagic-field` |
| `boon-of-fate` |
| `compulsion` |
| `conjure-elemental` |
| `delayed-blast-fireball` |
| `divine-word` |
| `earthquake` |
| `feral-pounce` |
| `forbiddance` |
| `geas` |
| `ghost-walk` |
| `gibbering` |
| `greater-restoration` |
| `ice-spear` |
| `lantern-of-revealing` |
| `levitate` |
| `living-shadow` |
| `maneuvering-attack` |
| `mist-walker` |
| `potion-of-vitality` |
| `prismatic-spray` |
| `steps-of-the-fey` |
| `symbiotic-being` |
| `telekinesis` |
| `toxic-escape` |
| `tsunami` |
| `wall-of-ice` |
| `wall-of-stone` |

#### `item-fixes.mjs` — 173 missing (of 174 in file)

| Identifier |
|---|
| `absorption-ioun-stone` |
| `acid` |
| `activation` |
| `alchemists-fire` |
| `antimatter-rifle` |
| `antitoxin` |
| `armor-of-vulnerability` |
| `arrow-catching-shield` |
| `awareness-ioun-stone` |
| `bag-of-beans` |
| `bead-of-force` |
| `belt-of-dwarvenkind` |
| `berserker-axe-enchanted` |
| `blackrazor` |
| `boots-of-speed` |
| `bracers-of-defense` |
| `burnt-othur-fumes` |
| `cape-of-the-mountebank` |
| `carrion-crawler-mucus` |
| `cloak-of-displacement` |
| `cloak-of-elvenkind` |
| `cloak-of-the-bat` |
| `coats` |
| `consumption` |
| `dagger-of-venom` |
| `decanter-of-endless-water` |
| `demonomicon-of-iggwilv` |
| `duration` |
| `duration` |
| `dust-of-disappearance` |
| `dust-of-sneezing-and-choking` |
| `dynamite-stick` |
| `ebonbane` |
| `eversmoking-bottle` |
| `eye-and-hand-of-vecna` |
| `flame-tongue-enchanted` |
| `fool` |
| `fortitude-ioun-stone` |
| `gem-of-brightness` |
| `gem-of-seeing` |
| `giant-slayer-enchanted` |
| `gloves-of-missile-snaring` |
| `gloves-of-swimming-and-climbing` |
| `greater-absorption-ioun-stone` |
| `grenade-smoke` |
| `hammer-of-thunderbolts-enchanted` |
| `harkons-bite` |
| `helm-of-brilliance` |
| `helm-of-brilliance-enchanted` |
| `helm-of-telepathy` |
| `holy-water` |
| `horn-of-blasting` |
| `horseshoes-of-a-zephyr` |
| `iron-bands-of-bilarro` |
| `iron-flask` |
| `jester` |
| `keoghtoms-ointment` |
| `lantern-of-revealing` |
| `laser-pistol` |
| `laser-rifle` |
| `lolths-sting` |
| `luck-blade-enchanted` |
| `mace-of-disruption` |
| `mace-of-terror` |
| `manacles` |
| `mangonel` |
| `mantle-of-spell-resistance` |
| `manual-of-bodily-health` |
| `manual-of-gainful-exercise` |
| `manual-of-quickness-of-action` |
| `moon-touched-sword` |
| `moon-touched-sword-enchanted` |
| `natures-sanctuary` |
| `necklace-of-adaptation` |
| `necklace-of-prayer-beads` |
| `net` |
| `nine-lives-stealer-enchanted` |
| `not` |
| `oathbow-enchanted` |
| `oil-of-sharpness` |
| `oil-of-slipperiness` |
| `onyx-dog-rare` |
| `orb-of-dragonkind` |
| `pale-tincture` |
| `periapt-of-health` |
| `periapt-of-wound-closure` |
| `pipes-of-haunting` |
| `poison-basic` |
| `poisoned-darts` |
| `poisoned-needle` |
| `potion-of-animal-friendship` |
| `potion-of-healing` |
| `potion-of-mind-reading` |
| `potion-of-pugilism` |
| `potion-of-resistance` |
| `quarterstaff-of-the-acrobat` |
| `ring-of-elemental-command-air` |
| `ring-of-elemental-command-earth` |
| `ring-of-elemental-command-fire` |
| `ring-of-elemental-command-water` |
| `ring-of-evasion` |
| `ring-of-feather-falling` |
| `ring-of-free-action` |
| `ring-of-invisibility` |
| `ring-of-spell-turning` |
| `ring-of-the-ram` |
| `ring-of-warmth` |
| `ring-of-x-ray-vision` |
| `robe-of-scintillating-colors` |
| `robe-of-stars` |
| `robe-of-the-archmagi` |
| `rod-of-absorption` |
| `rod-of-lordly-might` |
| `rod-of-rulership` |
| `rolling-stone` |
| `rope-of-entanglement` |
| `scarab-of-protection` |
| `scimitar-of-speed` |
| `scroll-of-protection` |
| `scroll-of-titan-summoning` |
| `sentinel-shield` |
| `shield-of-missile-attraction` |
| `silver-horn-of-valhalla` |
| `skull` |
| `spellguard-shield` |
| `staff-of-power` |
| `staff-of-striking` |
| `staff-of-swarming-insects` |
| `staff-of-the-magi` |
| `staff-of-thunder-and-lightning` |
| `staff-of-withering` |
| `sun-blade` |
| `superior-potion-of-healing` |
| `supreme-potion-of-healing` |
| `sword-of-life-stealing-enchanted` |
| `sword-of-sharpness` |
| `sword-of-sharpness-enchanted` |
| `sword-of-vengeance-enchanted` |
| `talisman-of-pure-good` |
| `talisman-of-ultimate-evil` |
| `target` |
| `targets` |
| `tentacle-rod` |
| `tome-of-clear-thought` |
| `tome-of-leadership-and-influence` |
| `tome-of-understanding` |
| `torch` |
| `torpor` |
| `trebuchet` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `unarmed-strike` |
| `uses` |
| `wand-of-paralysis` |
| `wand-of-polymorph` |
| `wand-of-web` |
| `wand-of-wonder` |
| `whelm` |

#### `lights.mjs` — 14 missing (of 14 in file)

| Identifier |
|---|
| `continual-flame` |
| `darkness` |
| `daylight` |
| `faerie-fire` |
| `fire-shield` |
| `flame-blade` |
| `hunger-of-hadar` |
| `light` |
| `prismatic-wall` |
| `produce-flame` |
| `shining-smite` |
| `starry-wisp` |
| `sunbeam` |
| `wall-of-fire` |

#### `monk.mjs` — 21 missing (of 23 in file)

| Identifier |
|---|
| `acrobatic-movement` |
| `cures` |
| `disciplined-survivor` |
| `do` |
| `elemental-attunement` |
| `elemental-epitome` |
| `fleet-step` |
| `flurry` |
| `hand-of-healing` |
| `hand-of-ultimate-mercy` |
| `heightened-focus` |
| `jump` |
| `martial-arts` |
| `monks-focus` |
| `open-hand-technique` |
| `perfect-focus` |
| `physicians-touch` |
| `self-restoration` |
| `stunning-strike` |
| `triggers` |
| `triggers` |

#### `monsters.mjs` — 31 missing (of 31 in file)

| Identifier |
|---|
| `avoidance` |
| `consume-energy` |
| `consume-life` |
| `deflect-blow` |
| `devour-intellect` |
| `draconic-strike` |
| `esoteric-ward` |
| `forbidden-knowledge` |
| `grave-dust-flight` |
| `ice-spear` |
| `limited-foresight` |
| `mm-beholder-eye-rays` |
| `mm-homunculus-bite` |
| `mm-pseudodragon-sting` |
| `mm-wereboar-gore` |
| `mm-wight-life-drain` |
| `noxious-miasma` |
| `psychic-skewer` |
| `reactive` |
| `shadow-veil` |
| `silver-needle` |
| `targets` |
| `toxic-escape` |
| `triggers` |
| `triggers` |
| `triggers` |
| `unraveling-flesh` |
| `vanish` |
| `warp-body` |
| `weakening-breath` |
| `whirling-form` |

#### `movables.mjs` — 2 missing (of 3 in file)

| Identifier |
|---|
| `cloud-of-daggers` |
| `conjure-celestial` |

#### `paladin.mjs` — 26 missing (of 29 in file)

| Identifier |
|---|
| `abjure-foes` |
| `aura` |
| `aura-of-alacrity` |
| `aura-of-warding` |
| `avenging-angel` |
| `banishing-smite` |
| `blinding-smite` |
| `changes` |
| `changes` |
| `do` |
| `elder-champion` |
| `emanation` |
| `holy-nimbus` |
| `inspiring-smite` |
| `lay-on-hands` |
| `restoring-touch` |
| `sacred-weapon` |
| `searing-smite` |
| `shining-smite` |
| `smite-of-protection` |
| `soul-of-vengeance` |
| `staggering-smite` |
| `thunderous-smite` |
| `triggers` |
| `vow-of-enmity` |
| `wrathful-smite` |

#### `ranger.mjs` — 12 missing (of 13 in file)

| Identifier |
|---|
| `defensive-tactics` |
| `do` |
| `do` |
| `do` |
| `do` |
| `dread-ambusher` |
| `dreadful-strikes` |
| `foe-slayer` |
| `hunters-prey` |
| `precise-hunter` |
| `relentless-hunter` |
| `shadowy-dodge` |

#### `ravenloft.mjs` — 60 missing (of 60 in file)

| Identifier |
|---|
| `aberrant-anatomy` |
| `ancient-might` |
| `any` |
| `avenger-spirit` |
| `brute-spirit` |
| `burst` |
| `circle-of-mortality` |
| `coward-spirit` |
| `death-curse` |
| `deaths-friend` |
| `discharge` |
| `do` |
| `echoing-soul` |
| `emanation` |
| `empowered-channeling` |
| `feral-pounce` |
| `form-of-dread` |
| `fortune-teller-spirit` |
| `gathered-whispers` |
| `ghost-walk` |
| `grave-touched` |
| `if` |
| `jolt-to-life` |
| `knowledge-from-a-past-life` |
| `living-shadow` |
| `lupin-howl` |
| `mark-of-sacrifice` |
| `mist-walker` |
| `necrotic-husk` |
| `path-to-the-grave` |
| `power-of-shadow` |
| `priest-spirit` |
| `ranges` |
| `second-skin` |
| `sentinel-at-deaths-door` |
| `shade-spirit` |
| `shadow-walk` |
| `sharp-eye-ravenloft` |
| `survivor-ravenloft` |
| `symbiotic-being` |
| `targets` |
| `teleport` |
| `touch-of-death` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `umbral-form` |
| `vampiric-bite` |
| `wails-from-the-grave` |
| `watchers` |
| `wrath-of-the-wild` |

#### `releases.mjs` — 6 missing (of 6 in file)

| Identifier |
|---|
| `checks` |
| `highlights` |
| `highlights` |
| `risks` |
| `tested` |
| `tested` |

#### `rogue.mjs` — 22 missing (of 23 in file)

| Identifier |
|---|
| `assassinate` |
| `cunning-action` |
| `cunning-strike` |
| `daze` |
| `devious-strikes` |
| `elusive` |
| `evasion` |
| `improved-cunning-strike` |
| `obscure` |
| `poison` |
| `psychic-veil` |
| `second-story-work` |
| `steady-aim` |
| `supreme-sneak` |
| `thiefs-reflexes` |
| `trace` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `trip` |
| `withdraw` |

#### `sorcerer.mjs` — 9 missing (of 9 in file)

| Identifier |
|---|
| `bastion-of-law` |
| `clockwork-cavalcade` |
| `do` |
| `do` |
| `elemental-affinity` |
| `innate-sorcery` |
| `not` |
| `psychic-defenses` |
| `revelation-in-flesh` |

#### `species.mjs` — 14 missing (of 16 in file)

| Identifier |
|---|
| `adrenaline-rush` |
| `brave` |
| `breath-weapon` |
| `celestial-revelation` |
| `do` |
| `do` |
| `draconic-flight` |
| `dwarven-resilience` |
| `fires-burn` |
| `frosts-chill` |
| `hills-tumble` |
| `if` |
| `large-form` |
| `relentless-endurance` |

#### `spell-rules.mjs` — 155 missing (of 165 in file)

| Identifier |
|---|
| `aid` |
| `air-element` |
| `antilife-shell` |
| `antimagic-field` |
| `arcane-gate` |
| `aura-of-vitality` |
| `beacon-of-hope` |
| `blade-barrier` |
| `blast` |
| `blink` |
| `call-lightning` |
| `chain-lightning` |
| `choice` |
| `choice` |
| `circle-of-power` |
| `cloudkill` |
| `compelled-duel` |
| `compulsion` |
| `conjure-barrage` |
| `conjure-celestial` |
| `conjure-minor-elementals` |
| `conjure-volley` |
| `conjure-woodland-beings` |
| `contact-other-plane` |
| `contagion` |
| `cordon-of-arrows` |
| `cures` |
| `death-ward` |
| `delayed-blast-fireball` |
| `demiplane` |
| `destructive-wave` |
| `disintegrate` |
| `dispel-evil-and-good` |
| `dispel-magic` |
| `divine-word` |
| `do` |
| `do` |
| `do` |
| `dragons-breath` |
| `earth-element` |
| `earthquake` |
| `enlarge-reduce` |
| `ensnaring-strike` |
| `entangle` |
| `enthrall` |
| `ethereal-jaunt` |
| `ethereal-stride` |
| `evards-black-tentacles` |
| `expeditious-retreat` |
| `eyebite` |
| `feign-death` |
| `fire-element` |
| `flammable` |
| `flesh-to-stone` |
| `forbiddance` |
| `forcecage` |
| `fount-of-moonlight` |
| `freedom-of-movement` |
| `gaseous-form` |
| `gate` |
| `geas` |
| `globe-of-invulnerability` |
| `grease` |
| `greater-restoration` |
| `gust-of-wind` |
| `hail-of-thorns` |
| `haste` |
| `heal` |
| `heat-metal` |
| `heroism` |
| `holy-aura` |
| `hunger-of-hadar` |
| `hypnotic-pattern` |
| `ice-storm` |
| `if` |
| `incendiary-cloud` |
| `insect-plague` |
| `jallarzis-storm-of-radiance` |
| `jump` |
| `levitate` |
| `levitate` |
| `lightning-arrow` |
| `mass-cure-wounds` |
| `mass-heal` |
| `maze` |
| `melfs-acid-arrow` |
| `mislead` |
| `modify-memory` |
| `mordenkainens-magnificent-mansion` |
| `otilukes-freezing-sphere` |
| `otilukes-resilient-sphere` |
| `ottos-irresistible-dance` |
| `phantasmal-force` |
| `plant-growth` |
| `pool` |
| `power-word-fortify` |
| `power-word-heal` |
| `power-word-kill` |
| `power-word-stun` |
| `prismatic-spray` |
| `prismatic-wall` |
| `raise-dead` |
| `regenerate` |
| `remove-curse` |
| `resurrection` |
| `reverse-gravity` |
| `see-invisibility` |
| `shatter` |
| `shining-smite` |
| `silence` |
| `sleep` |
| `sleet-storm` |
| `slow` |
| `smite` |
| `spider-climb` |
| `spike-growth` |
| `staggering-smite` |
| `stinking-cloud` |
| `storm-of-vengeance` |
| `swift-quiver` |
| `symbol` |
| `targets` |
| `telekinesis` |
| `thunderous-smite` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `triggers` |
| `true-resurrection` |
| `tsunami` |
| `umbral-dagger` |
| `vampiric-touch` |
| `wall-of-fire` |
| `wall-of-force` |
| `wall-of-ice` |
| `wall-of-stone` |
| `wall-of-thorns` |
| `water-element` |
| `wind-wall` |
| `word-of-radiance` |
| `yolandes-regal-presence` |

#### `spells.mjs` — 21 missing (of 21 in file)

| Identifier |
|---|
| `confusion` |
| `crown-of-madness` |
| `enlarge-reduce` |
| `eyebite` |
| `fear` |
| `flesh-to-stone` |
| `greater-restoration` |
| `hideous-laughter` |
| `invisibility` |
| `lesser-restoration` |
| `mislead` |
| `ottos-irresistible-dance` |
| `potion-of-invisibility` |
| `protection-from-poison` |
| `raise-dead` |
| `ray-of-enfeeblement` |
| `resurrection` |
| `revivify` |
| `sanctuary` |
| `tashas-hideous-laughter` |
| `true-resurrection` |

#### `summons.mjs` — 23 missing (of 23 in file)

| Identifier |
|---|
| `animate-dead` |
| `animate-objects` |
| `arcane-eye` |
| `conjure-animals` |
| `conjure-elemental` |
| `create-undead` |
| `dancing-lights` |
| `find-familiar` |
| `find-steed` |
| `guardian-of-faith` |
| `investment-of-the-chain-master` |
| `invoke-duplicity` |
| `mordenkainens-faithful-hound` |
| `pact-of-the-chain` |
| `phantom-steed` |
| `pilot` |
| `pilot` |
| `pilot` |
| `primal-companion` |
| `pulse` |
| `reanimated-companion` |
| `unseen-servant` |
| `wild-companion` |

#### `targets.mjs` — 23 missing (of 23 in file)

| Identifier |
|---|
| `animal-friendship` |
| `calm-emotions` |
| `cause-fear` |
| `channel-divinity` |
| `channel-divinity-cleric` |
| `charm-person` |
| `crown-of-madness` |
| `dnd5eactivity000` |
| `dominate-beast` |
| `dominate-person` |
| `flame-blade` |
| `flask-of-holy-water` |
| `hold-person` |
| `holy-water` |
| `hypnotic-pattern` |
| `magic-missile` |
| `prayer-of-healing` |
| `produce-flame` |
| `sear-undead` |
| `shillelagh` |
| `sleep` |
| `spare-the-dying` |
| `wild-resurgence` |

#### `teleports.mjs` — 5 missing (of 5 in file)

| Identifier |
|---|
| `boon-of-dimensional-travel` |
| `clouds-jaunt` |
| `dimension-door` |
| `misty-step` |
| `travel-along-the-tree` |

#### `tethers.mjs` — 3 missing (of 3 in file)

| Identifier |
|---|
| `ranges` |
| `tether` |
| `witch-bolt` |

#### `traces.mjs` — 3 missing (of 3 in file)

| Identifier |
|---|
| `blade-ward` |
| `flame-blade` |
| `produce-flame` |

#### `triggers.mjs` — 100 missing (of 112 in file)

| Identifier |
|---|
| `animal-friendship` |
| `beguiling-magic` |
| `blade-ward` |
| `blinding-smite` |
| `blindness-deafness` |
| `calm-emotions` |
| `cause-fear` |
| `channel-divinity` |
| `channel-divinity-cleric` |
| `charm-monster` |
| `charm-person` |
| `cloud-of-daggers` |
| `command` |
| `confusion` |
| `contagion` |
| `cordon-of-arrows` |
| `corrosive-form` |
| `crown-of-madness` |
| `dispel-evil-and-good` |
| `do` |
| `do` |
| `do` |
| `do` |
| `do` |
| `do` |
| `do` |
| `do` |
| `do` |
| `do` |
| `do` |
| `do` |
| `do` |
| `do` |
| `do` |
| `do` |
| `do` |
| `dominate-beast` |
| `dominate-monster` |
| `dominate-person` |
| `ensnaring-strike` |
| `eyebite` |
| `faerie-fire` |
| `fear` |
| `fire-shield` |
| `flesh-to-stone` |
| `forceful-hand` |
| `foresight` |
| `grasping-hand` |
| `great-weapon-master` |
| `guiding-bolt` |
| `gust-of-wind` |
| `hold-monster` |
| `hold-person` |
| `holy-aura` |
| `hunger-of-hadar` |
| `hypnotic-pattern` |
| `if` |
| `if` |
| `if` |
| `if` |
| `if` |
| `if` |
| `if` |
| `if` |
| `intimidating-presence` |
| `invoke-duplicity` |
| `mass-suggestion` |
| `melfs-acid-arrow` |
| `natures-wrath` |
| `ottos-irresistible-dance` |
| `pack-tactics` |
| `phantasmal-killer` |
| `prismatic-spray` |
| `ray-of-enfeeblement` |
| `rend-mind` |
| `sanctuary` |
| `sear-undead` |
| `searing-smite` |
| `sleep` |
| `sleet-storm` |
| `slow` |
| `spike-growth` |
| `spirit-shroud` |
| `stinking-cloud` |
| `suggestion` |
| `sunburst` |
| `symbol` |
| `synaptic-static` |
| `telekinetic` |
| `thorn-whip` |
| `thunderwave` |
| `vicious-mockery` |
| `vine-attack` |
| `vitriolic-sphere` |
| `wall-of-fire` |
| `wall-of-thorns` |
| `warding-bond` |
| `weird` |
| `wrathful-smite` |
| `zealous-presence` |

#### `warlock.mjs` — 18 missing (of 19 in file)

| Identifier |
|---|
| `beguiling-defenses` |
| `clairvoyant-combatant` |
| `dark-ones-own-luck` |
| `do` |
| `do` |
| `do` |
| `do` |
| `lifedrinker` |
| `misty-escape` |
| `pact-of-the-chain` |
| `psychic-spells` |
| `radiant-soul` |
| `repelling-blast` |
| `searing-vengeance` |
| `steps-of-the-fey` |
| `triggers` |
| `triggers` |
| `triggers` |

#### `wizard.mjs` — 12 missing (of 12 in file)

| Identifier |
|---|
| `arcane-recovery` |
| `do` |
| `do` |
| `empowered-evocation` |
| `greater-portent` |
| `illusory-self` |
| `portent` |
| `potent-cantrip` |
| `projected-ward` |
| `ritual-adept` |
| `sculpt-spells` |
| `spell-resistance` |

## 7. Illusive rules catalog (all entries)

| Rule id | Name | Automation | Edition | Notes |
|---|---|---|---|---|
| `combat.activity-use` | Use activity | full | system | Delegates rolls to dnd5e; Illusive owns workflow + explanation. |
| `combat.save-activity` | Save activity (damage + effects) | full | system | DAS-style: roll saves vs DC → scale damage (none/half/full) → apply effect profiles by save outcome. |
| `combat.economy.action` | Action (economy) | full | 2024 | flags.illusive-dnd-5e.actions |
| `combat.economy.bonus` | Bonus Action (economy) | full | 2024 | flags.illusive-dnd-5e.actions |
| `combat.economy.reaction` | Reaction (economy) | full | 2024 | Spend + hard/soft reaction windows (docs/combat-engine.md) |
| `combat.reaction.shield` | Shield (reaction) | full | 2024 | Hard on-attack-hit; acBonus +5 then re-check hit |
| `combat.reaction.counterspell` | Counterspell (reaction) | full | 2024 | Hard on-cast, 60 ft + sight. 2024: caster Con save vs reactor DC; on fail the spell is lost, action spent, slot refunded. 2014: auto ≤ the slot level Counterspell was cast with (HUD slot picker, min 3rd), else check DC 10 + level |
| `combat.reaction.hellish-rebuke` | Hellish Rebuke (reaction) | full | 2024 | Soft after-damage-applied, 60 ft + sight; linked to the parent for log/undo |
| `combat.reaction.uncanny-dodge` | Uncanny Dodge (reaction) | full | 2024 | Hard on-damage-known; attack roll by a seen attacker; halves the whole hit (riders included) |
| `combat.reaction.absorb-elements` | Absorb Elements (reaction) | full | 2014 | Hard on-damage-known (attacks and saves); resistance to the triggering elemental types only; skipped if already resistant. Next-turn rider: the first melee hit on the reactor's next turn adds 1d6 per slot level of the absorbed type |
| `combat.reaction.deflect` | Deflect Missiles / Attacks / Energy | full | 2024 | Hard on-damage-known; reduce 1d10 + Dex + Monk level. 2014 Missiles: ranged weapon attacks. 2024 Attacks: B/P/S attacks. Energy: any attack damage |
| `combat.reaction.silvery-barbs` | Silvery Barbs (reaction) | full | 2014 | Hard on-attack-hit / on-save-success / on-check-success, 60 ft + sight; the creature rerolls and keeps the lower roll. Advantage on the next attack, check, or save (1 minute) goes to the reactor's first target other than the trigger, else the reactor |
| `combat.reaction.parry` | Parry (monster reaction) | full | 2024 | Hard on-attack-hit vs melee attacks on the reactor; AC bonus read from "adds N to its AC", else proficiency bonus; that attack only |
| `combat.reaction.protection` | Protection (fighting style) | partial | 2024 | Hard on-attack-declared: an ally within 5 ft is attacked by a seen hostile while the reactor holds a shield; disadvantage on that attack. 2024 lingering disadvantage until the reactor's next turn: manual |
| `combat.reaction.interception` | Interception (fighting style) | full | 2024 | Hard on-damage-known: an ally within 5 ft hit by a seen hostile's attack; reduce 1d10 + proficiency bonus |
| `combat.reaction.countercharm` | Countercharm (2024 reaction) | full | 2024 | Hard on-save-fail, 30 ft, self or ally, vs effects applying Charmed/Frightened; reroll with advantage and keep the new roll. 2014 Countercharm (an action) is not matched |
| `combat.reaction.stones-endurance` | Stone's Endurance | full | 2024 | Hard on-damage-known; reduce 1d12 + Con modifier |
| `combat.reaction.superior-hunters-defense` | Superior Hunter's Defense (2024) | full | 2024 | Hard on-damage-known; resistance to the triggering types for this hit plus an effect until the current turn ends (currentTurnEnd) |
| `combat.reaction.feather-fall` | Feather Fall (reaction) | partial | 2024 | Detached hard on-fall (dnd5e plummet), 60 ft + sight; no fall damage and no prone. Up to 5 creatures within 60 ft, including a later fall that round |
| `combat.reaction.slow-fall` | Slow Fall (Monk) | full | 2024 | Detached hard on-fall, self only; reduce fall damage by 5 × Monk level; prone only if damage remains |
| `combat.reaction.storms-thunder` | Storm's Thunder (Goliath) | full | 2024 | Soft after-damage-applied, 60 ft; uses the feature's own damage activity |
| `combat.reaction.wrath-of-the-storm` | Wrath of the Storm (Tempest) | full | 2024 | Soft after-damage-applied, 5 ft + sight, attack hits only; uses the feature's own save activity |
| `combat.reaction.retaliation` | Retaliation (Berserker) | full | 2024 | Soft after-damage-applied, attacker within 5 ft; offers the reactor's equipped melee weapon attacks |
| `combat.reaction.riposte` | Riposte (Battle Master) | full | 2024 | Soft on-attack-miss vs melee misses within 5 ft; offers melee weapon attacks, spends a superiority die, adds the die to that attack's damage on a hit |
| `combat.action.ready` | Ready | partial | 2024 | Pick a trigger (hostile moves within range / casts / attacks) and an activity; a soft reaction prompt offers it when the trigger fires; lapses at the readier's next turn start. A readied spell spends its slot and starts concentration when readied; release does not spend the slot again; a lapse keeps the slot spent and ends concentration |
| `combat.reaction.cutting-words` | Cutting Words (reaction) | full | 2024 | Hard on-attack-hit, 60 ft + sight; subtract the Bardic Inspiration die from the attack (a natural 20 still hits) |
| `combat.range.check` | Activity range gate | full | convenience | Closest-square + elevation; melee reach vs ranged normal/long/thrown; long band allowed; cover gate separate. |
| `combat.opportunity-attack.2024` | Opportunity Attacks | full | 2024 | Leave reach → reaction melee; Disengage / teleport / forced movement cancel |
| `combat.opportunity-attack.2014` | Opportunity Attacks | full | 2014 | Leave reach → reaction melee; must see the mover |
| `combat.cover.2024` | Cover | full | 2024 | half +2 / three-quarters +5 AC & Dex saves; total blocks targeting |
| `combat.cover.2014` | Cover | full | 2014 | Same bonus matrix as 2024; sampled wall rays → level |
| `combat.correction` | GM correction / scoped undo | full | convenience | Reverses appliedChanges (HP, effects, knockout, flags) via applyUndoPlan |
| `combat.correction` | GM correction / scoped undo | full | convenience | Alias of combat.correction |
| `combat.grapple.2024` | Grappling | reference-only | 2024 | Unarmed Strike → save vs Grapple DC. Not auto-resolved in v1. |
| `combat.grapple.2014` | Grappling | reference-only | 2014 | 2014 / Legacy — Athletics contest. Not auto-resolved in v1. |
| `movement.path` | Pathfinding | full | convenience | A* over normalized blocked cells |
| `vision.evaluate` | Visibility check | full | 2024 | Uses LOS + lighting + senses factors; indeterminate when facts missing |
| `lighting.evaluate` | Lighting at point | full | convenience | Single owner; vision consumes result |
| `loot.transfer` | Transfer item | full | convenience | Validate then inventory adapter |
| `combat.triggers` | Declared triggers | full | convenience | Moment + condition + steps as data; writes journaled for undo |
| `combat.trigger.blur` | Blur | full | 2024 | Passive attackDeclared; disadvantage unless the attacker has Blindsight or Truesight |
| `combat.trigger.protection-from-evil-and-good` | Protection from Evil and Good | partial | 2024 | Passive attackDeclared disadvantage from listed creature types; charm/fright/possession immunity not automated |
| `combat.trigger.armor-of-agathys` | Armor of Agathys | partial | 2024 | Passive isHit; 5 cold per slot level to a melee attacker while temp HP remain; effect does not end itself at 0 temp HP |
| `combat.trigger.heavy-armor-master` | Heavy Armor Master | partial | 2024 | Passive damageKnown; 2024 reduces B/P/S from attacks by PB, 2014 by 3 from nonmagical weapons |
| `combat.trigger.dark-ones-blessing` | Dark One's Blessing | partial | 2024 | Passive isDamaged; temp HP when the warlock drops a hostile creature to 0 within 10 ft |
| `combat.trigger.defensive-duelist` | Defensive Duelist | partial | 2024 | Hard isHit reaction; +PB AC against a melee hit while wielding a Finesse weapon (lasts for that attack only) |
| `combat.rider.divine-smite` | Divine Smite | full | 2024 | Prompted hitDamage; rolls the spell's damage into the hit |
| `combat.rider.sneak-attack` | Sneak Attack | full | 2024 | Prompted hitDamage; rolls the feature's damage into the hit |
| `combat.rider.eldritch-smite` | Eldritch Smite | full | 2024 | Prompted hitDamage; rolls the invocation's damage into the hit |
| `combat.rider.hex` | Hex | full | 2024 | Automatic hitDamage on the creature the caster marked |
| `combat.rider.hunters-mark` | Hunter's Mark | full | 2024 | Automatic hitDamage on the creature the caster marked |
| `combat.rider.colossus-slayer` | Colossus Slayer | full | 2024 | Passive hitDamage; 1d8 once a turn |
| `combat.rider.divine-fury` | Divine Fury | full | 2024 | Passive hitDamage; 1d6 + half level once a turn |
| `combat.aura.aura-of-protection` | Aura of Protection | full | 2024 | Aura declaration; save bonus for allies in range |
| `combat.aura.aura-of-courage` | Aura of Courage | full | 2024 | Aura declaration; frightened immunity for allies in range |
| `combat.aura.aura-of-devotion` | Aura of Devotion | full | 2024 | Aura declaration; charmed immunity for allies in range |
| `combat.aura.spirit-guardians` | Spirit Guardians | full | 2024 | Aura declaration; damages enemies who start their turn inside |
| `combat.aura.aura-of-life` | Aura of Life | full | 2024 | Aura declaration; necrotic resistance for allies in range |
| `combat.aura.aura-of-purity` | Aura of Purity | full | 2024 | Aura declaration; condition immunity for allies in range |
| `combat.spell.moonbeam` | Moonbeam | full | 2024 | Movable zone; Constitution save for 2d10 radiant on enter or turn start; bonus action moves it 60 feet |
| `combat.spell.web` | Web | full | 2024 | Dexterity save or restrained; difficult terrain; fire burns the webs for 2d4 |
| `combat.spell.oil` | Oil | full | 2024 | Flammable ground; fire lights it for 5 fire damage when a creature enters or starts its turn there |
| `combat.spell.caltrops` | Caltrops | full | 2024 | Dexterity save DC 15 or 1 piercing and −10 speed until healed |

## 8. DAS API surface (all 356 paths)

Illusive does not expose this contract. Listed so the gap is concrete.

| API path |
|---|
| `active` |
| `ammo.options` |
| `ammo.set` |
| `antimagic.blocks` |
| `antimagic.use` |
| `approach` |
| `atCost.candidates` |
| `atCost.dismiss` |
| `atCost.enabled` |
| `atCost.margin` |
| `atCost.offer` |
| `atCost.offerOnMessage` |
| `atCost.offerOnRow` |
| `basics.data` |
| `basics.take` |
| `budget.issues` |
| `budget.spend` |
| `climb.ceiling` |
| `climb.down` |
| `climb.drop` |
| `climb.edges` |
| `climb.enabled` |
| `climb.entries` |
| `climb.grab` |
| `climb.holds` |
| `climb.run` |
| `climb.setEnabled` |
| `climb.state` |
| `climb.toward` |
| `climb.up` |
| `combat.addEvent` |
| `combat.events` |
| `combat.isEvent` |
| `combat.removeEvent` |
| `combatLaunch.begin` |
| `combatLaunch.cancel` |
| `combatLaunch.candidates` |
| `combatLaunch.launch` |
| `combatLaunch.open` |
| `combatLaunch.pending` |
| `content.builtin` |
| `content.facts` |
| `content.identifierOf` |
| `content.inspect` |
| `content.of` |
| `content.recipes.build` |
| `content.recipes.condition` |
| `content.recipes.factOptions` |
| `content.recipes.facts` |
| `content.recipes.fieldKinds` |
| `content.recipes.list` |
| `content.recipes.publicKeys` |
| `content.recipes.version` |
| `content.register` |
| `content.registered` |
| `content.set` |
| `content.shipped` |
| `content.sources` |
| `content.unregister` |
| `content.validate` |
| `content.validateSources` |
| `content.version` |
| `content.world` |
| `correction.apply` |
| `correction.open` |
| `correction.shape` |
| `correction.undo` |
| `debug.clear` |
| `debug.enabled` |
| `debug.errors` |
| `debug.logs` |
| `debug.onError` |
| `debug.open` |
| `debug.openConnectionTest` |
| `debug.register` |
| `debug.registered` |
| `debug.testConnection` |
| `debug.total` |
| `debug.trail` |
| `debug.trailList` |
| `debug.verbose` |
| `debug.verboseEverywhere` |
| `diagnostic.open` |
| `drop` |
| `ethereal.enabled` |
| `ethereal.is` |
| `ethereal.perceives` |
| `ethereal.setEnabled` |
| `ethereal.toggle` |
| `factions.NONE` |
| `factions.PARTY` |
| `factions.add` |
| `factions.assign` |
| `factions.explicit` |
| `factions.grudge` |
| `factions.grudges` |
| `factions.list` |
| `factions.name` |
| `factions.of` |
| `factions.open` |
| `factions.relation` |
| `factions.relations` |
| `factions.remove` |
| `factions.setRelation` |
| `factions.side` |
| `factions.stance` |
| `factions.suggest` |
| `flee` |
| `floats.export` |
| `floats.fonts` |
| `floats.import` |
| `floats.open` |
| `floats.play` |
| `floats.reset` |
| `floats.try` |
| `gap` |
| `gm.alert` |
| `gm.forced` |
| `heroic.has` |
| `heroic.mode` |
| `heroic.set` |
| `level` |
| `levelAtLeast` |
| `light` |
| `mastery.judge` |
| `mastery.open` |
| `mastery.sources` |
| `mcp.actionEnd` |
| `mcp.advanceTime` |
| `mcp.animations` |
| `mcp.atCost` |
| `mcp.attackReasons` |
| `mcp.awaiting` |
| `mcp.barrier` |
| `mcp.budget` |
| `mcp.burning` |
| `mcp.castFromBar` |
| `mcp.castPicked` |
| `mcp.catalyst` |
| `mcp.chainCheck` |
| `mcp.chatCards` |
| `mcp.clickCard` |
| `mcp.climb` |
| `mcp.climbCeiling` |
| `mcp.climbDown` |
| `mcp.climbHolds` |
| `mcp.climbState` |
| `mcp.climbToward` |
| `mcp.clock` |
| `mcp.closeWindow` |
| `mcp.concentrate` |
| `mcp.connectionTest` |
| `mcp.controlToken` |
| `mcp.controls` |
| `mcp.cover` |
| `mcp.coverPreview` |
| `mcp.damageTypes` |
| `mcp.dash` |
| `mcp.debugClear` |
| `mcp.debugReport` |
| `mcp.debugThrow` |
| `mcp.debugVerbose` |
| `mcp.diagnosticBackups` |
| `mcp.diagnosticForget` |
| `mcp.diagnosticRepair` |
| `mcp.diagnosticRestore` |
| `mcp.diagnosticScan` |
| `mcp.door` |
| `mcp.dropDown` |
| `mcp.effectOrigins` |
| `mcp.enchant` |
| `mcp.endings` |
| `mcp.etherealWalls` |
| `mcp.factions` |
| `mcp.familiar` |
| `mcp.familiarPocket` |
| `mcp.familiarRecall` |
| `mcp.flammable` |
| `mcp.flight` |
| `mcp.follow` |
| `mcp.followState` |
| `mcp.forcePlayerWait` |
| `mcp.foreignSetting` |
| `mcp.fortified` |
| `mcp.gmAlerts` |
| `mcp.gmQueue` |
| `mcp.gmQueueAnswer` |
| `mcp.gmQueueForce` |
| `mcp.gmQueueRoll` |
| `mcp.grab` |
| `mcp.grappleState` |
| `mcp.groupRoll` |
| `mcp.groupRollBreakdown` |
| `mcp.groupRollForce` |
| `mcp.groupRollMode` |
| `mcp.groupRollState` |
| `mcp.hampered` |
| `mcp.heal` |
| `mcp.hoist` |
| `mcp.hood` |
| `mcp.hurt` |
| `mcp.identify` |
| `mcp.inventory` |
| `mcp.issues` |
| `mcp.itemData` |
| `mcp.jump` |
| `mcp.lightState` |
| `mcp.lock` |
| `mcp.longRest` |
| `mcp.makeScroll` |
| `mcp.masteries` |
| `mcp.menu` |
| `mcp.move` |
| `mcp.movement` |
| `mcp.naturalOne` |
| `mcp.overrideContent` |
| `mcp.owners` |
| `mcp.perceived` |
| `mcp.perf` |
| `mcp.pickTargets` |
| `mcp.placeItemEffect` |
| `mcp.placeMenu` |
| `mcp.placeRegionAt` |
| `mcp.plan` |
| `mcp.planning` |
| `mcp.portent` |
| `mcp.range` |
| `mcp.rangeCheck` |
| `mcp.rangedPlacement` |
| `mcp.rawMove` |
| `mcp.reachCheck` |
| `mcp.ready` |
| `mcp.reload` |
| `mcp.removeItemEffect` |
| `mcp.reports` |
| `mcp.restoreItem` |
| `mcp.rollCard` |
| `mcp.rollCheck` |
| `mcp.rollSave` |
| `mcp.runMacro` |
| `mcp.saveChance` |
| `mcp.scatter` |
| `mcp.screenAfterUpdate` |
| `mcp.screenHere` |
| `mcp.scrollReading` |
| `mcp.sees` |
| `mcp.sequencer` |
| `mcp.setOwners` |
| `mcp.setting` |
| `mcp.settingsChanged` |
| `mcp.sheetUse` |
| `mcp.shortRest` |
| `mcp.sightIssues` |
| `mcp.skillAid` |
| `mcp.skillAids` |
| `mcp.stairs` |
| `mcp.stairsAt` |
| `mcp.stand` |
| `mcp.stats` |
| `mcp.status` |
| `mcp.stealth` |
| `mcp.storm` |
| `mcp.stormStrike` |
| `mcp.summonAt` |
| `mcp.summonCaptured` |
| `mcp.takeStairs` |
| `mcp.teleport` |
| `mcp.teleportPick` |
| `mcp.threats` |
| `mcp.timer` |
| `mcp.toggleLight` |
| `mcp.tokenLight` |
| `mcp.transpose` |
| `mcp.unfollow` |
| `mcp.upkeep` |
| `mcp.use` |
| `mcp.view` |
| `mcp.viewScene` |
| `mcp.visionMatrix` |
| `mcp.waits` |
| `mcp.wall` |
| `mcp.wallSide` |
| `mcp.windows` |
| `nonLethal.get` |
| `nonLethal.knockedOut` |
| `nonLethal.set` |
| `path` |
| `perf.longTasks` |
| `perf.report` |
| `perf.reset` |
| `perf.table` |
| `queue.answer` |
| `queue.force` |
| `queue.list` |
| `queue.open` |
| `queue.roll` |
| `reason` |
| `releaseNotes.open` |
| `reports.clear` |
| `reports.list` |
| `reports.open` |
| `reports.text` |
| `rolls.breakdown` |
| `rolls.force` |
| `rolls.mode` |
| `rolls.open` |
| `rolls.request` |
| `rolls.title` |
| `rolls.tracker` |
| `rolls.view` |
| `routes` |
| `save` |
| `scrolls.spellOf` |
| `settings.open` |
| `settings.registerWindow` |
| `skippedRoutes` |
| `sneak.check` |
| `sneak.is` |
| `sneak.rules` |
| `sneak.set` |
| `sneak.spottedBy` |
| `sneak.toggle` |
| `stopWalks` |
| `theater.active` |
| `theater.set` |
| `ui.awaiting` |
| `ui.budget` |
| `ui.carriedLight` |
| `ui.carriedLights` |
| `ui.cell` |
| `ui.cost` |
| `ui.cover` |
| `ui.doorMenu` |
| `ui.globalLight` |
| `ui.groundMenu` |
| `ui.issues` |
| `ui.light` |
| `ui.movableZone` |
| `ui.movement` |
| `ui.multiattackLeft` |
| `ui.ritual` |
| `ui.targeting` |
| `ui.timer` |
| `ui.toggleLight` |
| `ui.tokenMenu` |
| `ui.wards` |
| `unitFactors` |
| `vanilla.is` |
| `vanilla.use` |
| `vision.canHear` |
| `vision.canSee` |
| `vision.cone` |
| `waits.force` |
| `waits.list` |
| `waits.open` |
| `welcome.open` |

## 9. DAS settings keys (all 128)

| Setting key |
|---|
| `automationLevel` |
| `autoTranslate` |
| `autoUsage` |
| `combatLaunchButton` |
| `damageFlow` |
| `dataFixes` |
| `etherealPlane` |
| `groupRollSeconds` |
| `provideBasicActions` |
| `reactionPrompts` |
| `realTimeClock` |
| `refusalMode` |
| `sidebarButton` |
| `theaterOfMind` |
| `aurasOnlyInCombat` |
| `combatWindowSeconds` |
| `combatWindowUnlimited` |
| `cover` |
| `criticalMode` |
| `criticalNpc` |
| `criticalTable` |
| `critMargin` |
| `endUnaffected` |
| `flanking` |
| `flankingConga` |
| `flankingSide` |
| `heroicInspiration` |
| `legendaryResistance` |
| `masteryRules` |
| `nonLethalMenu` |
| `npcSaveChoice` |
| `portent` |
| `sneakAttackMode` |
| `somaticHands` |
| `successAtCost` |
| `successAtCostHold` |
| `zoneChoice` |
| `altitude` |
| `autoFall` |
| `clickToMove` |
| `climbRules` |
| `climbSystem` |
| `climbSystemButton` |
| `fireSpread` |
| `highJumpMenu` |
| `lockFailure` |
| `pathPreview` |
| `teleportPlanning` |
| `volumes` |
| `coneAngles` |
| `factionIcons` |
| `factionRules` |
| `lightIndicator` |
| `passivePerception` |
| `stealthRules` |
| `surpriseFromStealth` |
| `twilightDarkness` |
| `unconsciousSenses` |
| `vision` |
| `visionCones` |
| `ammoPrompt` |
| `attackLine` |
| `attackLineMelee` |
| `clickToAttack` |
| `closeSheetOnUse` |
| `coverPreview` |
| `fastAttack` |
| `hitChance` |
| `hitChancePlayers` |
| `quickRolls` |
| `releaseTargets` |
| `situationalCursor` |
| `targetingBanner` |
| `targetingMode` |
| `animationWait` |
| `chatCompact` |
| `chatLight` |
| `chatPurgeKeep` |
| `chatPurgeMax` |
| `forcedAlerts` |
| `gmAlertBanner` |
| `gmAlerts` |
| `gmAlertSeconds` |
| `syncAnimations` |
| `awaitingGm` |
| `awaitingHide` |
| `awaitingShow` |
| `feedbackText` |
| `floatAdvantage` |
| `floatAttacks` |
| `floatChecks` |
| `floatCover` |
| `floatDice` |
| `floatDirection` |
| `floatDistance` |
| `floatDuration` |
| `floatEffects` |
| `floatHits` |
| `floatIcons` |
| `floatInitiative` |
| `floatPrompts` |
| `floatReactions` |
| `floatResources` |
| `floatSaves` |
| `floatScale` |
| `floatSounds` |
| `floatSoundVolume` |
| `floatSpacing` |
| `floatStrikes` |
| `floatSystem` |
| `timerHideSeconds` |
| `automationBadges` |
| `connectionTest` |
| `debugAllModules` |
| `debugCapture` |
| `debugMenu` |
| `debugNotify` |
| `perfWarnMs` |
| `autoRotateNotice` |
| `combatLaunch` |
| `combatLaunchPlaylist` |
| `contentOverrides` |
| `ddbNotice` |
| `factions` |
| `floatCoreMuted` |
| `floatTheme` |
| `itemReports` |
| `welcomeSeen` |

## 10. Illusive-owned areas DAS does not replace

From Illusive tree / Beyond work (not claimed by DAS README as in-core):

| Area | Illusive location |
|---|---|
| D&D Beyond live sync (HP, conditions, slots, rolls→chat) | `src/dnd-beyond-sync/` |
| Action bar / party / boss / mobile HUD | `src/hud/` |
| Tabletop chrome / pilot / lock | `src/tabletop/` |
| Animation fallbacks (AA / Sequencer / TMFX) | `src/animation/` |

## 11. Gap closure plan (fine slices)

Illusive is **its own automation model**: exclusive of Midi-QOL, DAS · Core, and any other module that owns the combat loop. Feature ideas may be compared to DAS (this doc), but implementations stay Illusive declarations + Illusive windows + official **dnd5e / Foundry** APIs. Do not port DAS code, ids-of-activities from DAS comments, or DAS adapter patches.

**Official Foundry line (non-negotiable in every slice):**

| Rule | Meaning |
|---|---|
| System owns dice and items | Rolls, activities, slots, conditions stay dnd5e; Illusive orchestrates |
| Public hooks / documented APIs only | No Foundry core patches; no silent monkey-patches of dnd5e internals when a public path exists |
| Prefer `system.identifier` from official SRD / premium content | Name regex is a fallback for imports, not the primary key for new declarations |
| One combat-loop owner | `module.json` conflicts with Midi-QOL (and DAS if both would load); do not dual-drive damage/reactions |
| HUD stays in-module | Do not split to a DAS-style neighbour UI unless product direction changes |

Each slice below is meant to be one PR-sized unit: code + tests + catalog citation. A phase is done when every slice in it has tests.

### Current status (this is the table to use)

Sections 0–10 were extracted before the content packs. They still list identifiers. They do not say what Illusive does now. This section does.

| Feature | Status | What it does |
|---|---|---|
| Sentinel, Polearm Master, War Caster | In | Opportunity and reach prompts. Sentinel sets Halted on the hit when the pending flag is set. |
| Lucky | In | Disadvantage on an attack against you, and a reroll on your failed save or your miss. Ability checks are not covered. |
| Sanctuary | In | An effect named Sanctuary cancels an attack against that creature. Owning the spell does not. |
| Illusory Self, Warding Flare | In | A hit against you misses, or the attack has disadvantage. |
| Shield Master | In | Dexterity save evasion while you wield a shield. |
| Mage Slayer | In | Melee prompt when an enemy casts, and a concentration save with disadvantage if you damage them from 5 feet. |
| Circle of Power | In | Allies in 30 feet: advantage on magical saves, and no damage or half damage. |
| Portent, Greater Portent | In | Store d20s on a rest. Replace an attack or save. Ability checks are not covered. |
| Evasion, Potent Cantrip, Sculpt Spells | In | Save damage math. |
| Deflect Energy | In | Only acid, cold, fire, force, lightning, thunder. |
| Charm and fear resaves, Command, Compulsion | In | Damage prompts the save or ends the named effect. |
| Blindness/Deafness, Contagion, Bestow Curse | In | One condition. Deafened is not a choice. |
| Guiding Bolt, Faerie Fire | In | The mark ends on a hit. Attacks against that creature have advantage. |
| Blade Ward | In | Resistance to bludgeoning, piercing, and slashing until your turn ends. |
| Spike Growth, Cloudkill, Stinking Cloud, Hunger of Hadar, Insect Plague, Cloud of Daggers, Wall of Fire, Entangle, Grease, Black Tentacles, Sleet Storm, Blade Barrier | In | Filled circles. Wall of Fire and Blade Barrier are areas, not lines, and they do not block movement. |
| Hold Person, Hold Monster, Hideous Laughter | In | One save, one condition. No repeat save. |
| Crusher, Slasher, Grappler, Charger, Tavern Brawler, Defense, Dueling | In | Push, speed 0, grapple, attack bonus plus push, push, +1 AC on that attack, +2 on every hit. |
| Action Surge, Indomitable, Stunning Strike, Assassinate, Steady Aim, Arcane Ward, Projected Ward, Brutal Strike | In | Extra action, save reroll, stun save, advantage vs surprised, advantage plus no movement, temp HP, redirect, optional 1d10. |
| Metamagic (eight options) | In | The cast offers the option. |
| Maneuvers except Evasive Footwork | In | Push, frighten, disadvantage, prone, attack bonus, temp HP, advantage, extra damage. |
| Evasive Footwork | Not applied | The die is spent. Nothing reads the AC bonus on that moment. |
| Aura of Protection and the other save auras | In | Save bonus. |
| Aura of Alacrity | In | Allies gain +10 walk speed. |
| Aura of Warding, Aura of Conquest | Notes only | No mechanical change. |
| Suggestion, Calm Emotions, Crown of Madness, Ensnaring Strike, Blinding Smite, Fire Shield, Flesh to Stone | In | See the catalog note on each rule. Crown of Madness does not choose the attack. Fire Shield always deals fire. |
| Dispel Evil and Good | Partial | Removes charmed, frightened, and possessed from you. Dismissal hides a listed creature type and marks it defeated. |
| Slow | Partial | Wisdom save. A failure multiplies walk speed by 0.5. It does not limit actions. |
| Confusion | Partial | A failed save sets the confusion flag. The existing d10 ticker runs on later turns. |
| Haste | Partial | +2 AC, and one extra action each turn while the effect is named Haste. No lethargy. The extra action is not limited to one attack. |
| Death Ward | In | A warded creature damaged to 0 hit points heals 1 and the effect ends. |
| Power Word Stun, Power Word Kill | In | Stun at 150 or fewer. Kill deals current hit points at 100 or fewer. |
| Piercer | Partial | Critical piercing hits add 1d8. One damage die is not rerolled. |
| Unarmed Fighting | Partial | Extra 1d4 while the grappling flag is set. The unarmed die size is not changed. |
| Speedy, Boon of Speed, Boon of Fortitude, Observant, Devil's Sight | In | One effect each: speed, speed, max HP plus healing, passive Perception, darkvision. |
| Alert | Partial | Surprised is removed. After initiative, a dialog can swap your total with an ally. |
| Skulker | Partial | A missed ranged attack hides you when recorded light at your token is dim or dark. |
| Poisoner | In | Constitution save, 2d8 poison, poisoned. Resistance is not ignored. |
| Boon of Combat Prowess | In | A miss can become a hit, once per round. |
| Boon of Fate | Partial | Adds 2d4 to your attack roll. It does not subtract, and it does not change a save. |
| Boon of Recovery | Partial | At 0 hit points, heal half your maximum, once per round. The real limit is once per long rest. |
| Disarming Attack | Partial | Strength save or an effect named Disarmed. The weapon stays equipped. |
| Studied Attacks | In | A miss grants advantage on your next attack roll. |
| Relentless Rage | In | Constitution save. DC starts at 10 and increases by 5 after each success. |
| Step of the Wind, Patient Defense | In | The turn is dashed and disengaged, or dodging. |
| Cunning Strike | Partial | Trip or poison. A sneak-attack die is not spent. |
| Turn Undead | In | Wisdom save or frightened, if the target's creature type is undead. |
| Cleansing Touch | Partial | Removes four conditions. It does not end a spell. |
| Horde Breaker | In | A melee prompt against a creature within 5 feet of the target, once per turn. |
| Dread Ambusher | Partial | Extra 1d8 piercing in round 1. The extra speed is not applied. |
| Agonizing Blast, Repelling Blast, Grasp of Hadar, Lance of Lethargy | In | Only Eldritch Blast. Charisma damage, push 10, pull 10, walk −10. |
| Bardic Inspiration | In | The ally's next attack roll, check, or save adds the Bardic Inspiration die. |
| Pack Tactics | In | Advantage when an ally is within 5 feet of the target. |
| Flyby | Partial | A creature with Flyby and a fly speed does not provoke. The move does not record a fly step versus a walk step. |
| Reactive | In | Each turn starts with one extra reaction. |
| Spell Sniper | Partial | Spell attacks ignore half cover and three-quarters cover. Range is not increased. |
| Zone replay | In | Creating a zone that deals damage or forces a save applies that effect once to creatures already inside. |
| Wall of Force, Wall of Stone, Forcecage | Partial | A closed circle centered on you. Creatures cannot enter or leave, including you. Not a wall line or a bar cage. |
| Antilife Shell | Partial | A circle that follows you. Other creatures cannot enter. You can. |
| Globe of Invulnerability | Partial | A spell of level 5 or lower does not affect a creature inside the circle. The slot is still spent. |
| Antimagic Field | Partial | A spell cast from inside the circle is cancelled. The slot is still spent. |
| Misty Step | Partial | You move to 5 feet from the selected creature, within 30 feet. |
| Bait and Switch | Partial | You trade places with the nearest ally within 5 feet. No AC bonus. |
| Dispel Evil and Good dismissal | Partial | A listed creature type that fails a Charisma save is hidden and marked defeated. It stays on this scene. |
| Elemental Adept | Partial | You pick one type. Your spells ignore resistance to it. A damage die of 1 stays 1. |
| Boon of Irresistible Offense | Partial | Weapon attacks ignore resistance to bludgeoning, piercing, and slashing. No extra critical die. |
| Boon of Energy Resistance | In | You pick one type. An effect grants resistance to it. |
| Boon of Spell Recall | Partial | Restores the highest expended slot of level 4 or lower. No d6. |
| Alert swap, Ambush, Remarkable Athlete | Partial | Alert opens a swap dialog after initiative. Ambush adds proficiency on that roll. Remarkable Athlete marks the roll advantage and adds half proficiency to Athletics. |
| Tactical Mind, Commanding Presence | Partial | Stores a die on the next attack, check, or save. It does not change a roll that already finished. |
| Maneuvering Attack, Instinctive Pounce, Tactical Shift | Partial | A grant of 15 feet that does not spend speed or provoke. Not half speed. |
| Commander's Strike | Partial | The ally gains one reaction. You do not pick their weapon. |
| Lunging Attack | In | The next melee attack reaches 5 feet farther. |
| Boon of the Night Spirit, Skulker | Partial | Invisible or hidden only when recorded scene light at the token is dim or dark. |
| Relentless Rage | In | Constitution save. DC starts at 10 and increases by 5 after each success. |

### Systems not developed

These three are still not built.

| System | What is missing | Named rules left out |
|---|---|---|
| Summons | A spell does not create an actor or a token. | Conjure spells, Find Familiar, Animate Dead |
| Ethereal | No second plane. | Etherealness, Blink |
| Doors and locks | No door or lock state. | Knock, Arcane Lock |

These stay on the system, not in this module: Medium Armor Master, Persistent Rage, Athlete standing from prone, Crossbow Expert's close-range penalty (this module never applies that penalty), Armor of Shadows (the cast is the spell's own activity), Wild Shape (the sheet activity transforms; the wild-shape step needs a chosen beast). Jump distance for Remarkable Athlete is not increased. Evasive Footwork still spends the die and does not change AC. Aura of Warding and Aura of Conquest still have no mechanical effect.

### Phase 0 — Lock the product rules

| Slice | Work | Done when |
|---|---|---|
| **0.1** | Document exclusivity in `module.json` `relationships.conflicts` (midi-qol; dnd5e-combat / DAS if both would fight the loop) and one paragraph in combat-engine.md | Conflicts listed; combat-engine states “Illusive owns the loop” |
| **0.2** | Declaration matching policy: primary = official `system.identifier`; secondary = name regex for imports; never DAS activity document ids | Policy in declarations header + one test that official id wins |
| **0.3** | “No second automator” smoke: if a conflicting module is active, refuse to start resolve / show one warning | Warning path tested |

### Phase A — Engine vocabulary (moments, steps, maps)

#### A0 — Map what already exists

| Slice | Work | Done when |
|---|---|---|
| **A0.1** | Table: DAS CONTENT action → Illusive step (halve→damageMultiplier, reduce→damageReduce, …) | Checked into docs (this section or beyond-translation-style map) |
| **A0.2** | Table: DAS moment name → Illusive moment / alias | Same |
| **A0.3** | Audit false positives in §6.3 (`do`, `choice`, `triggers` nested keys) and mark “not an identifier” | Clean missing lists for Phase C |

#### A1 — Publish missing moments (one slice per moment family)

| Slice | Moment(s) | Wire from | Unlocks |
|---|---|---|---|
| **A1.1** | `isAttacked` (vs `attackDeclared`) | Target chosen / attack aimed, before roll | Lucky, Sanctuary, Warding Flare |
| **A1.2** | `enemyAttacks` | Hostile attack declared (listener is not the target) | Protection-style ally reactions already partly covered — align naming |
| **A1.3** | `allyIsHit` / `allyIsDamaged` / `allyAttacks` | Same windows as isHit/isDamaged but relation.ally | Sentinel, Interception allies, Projected Ward |
| **A1.4** | `enemyDisengages` | Disengage action used by hostile in reach | Sentinel |
| **A1.5** | `enemyAttacked` | Hostile was attacked | Soul of Vengeance |
| **A1.6** | `enter` | Token enters a combat region / zone | Zone replay (Phase D0) |
| **A1.7** | `preAttackRoll` alias or rename clarity vs `attackDeclared` | Document one canonical name; accept the other in declarations | Feat pre-roll packs |
| **A1.8** | Turn loops: ensure `turnStart` / `turnEnd` run `repeatSave` / zone ticks for every combatant | Primary writer only | Dominate resaves, Spirit Guardians ticks |

#### A2 — New or aliased steps (one slice per patch family)

| Slice | Step | Behaviour | Unlocks |
|---|---|---|---|
| **A2.1** | `halve` alias | → `damageMultiplier` 0.5 | Cleaner declarations |
| **A2.2** | `miss` | Force a hit outcome to miss (no damage) | Illusory Self |
| **A2.3** | `ward` | Attacker must save (or check) or the attack is wasted | Sanctuary |
| **A2.4** | `uncrit` | Critical becomes normal hit | Sentinel at Death’s Door (later) |
| **A2.5** | `intercept` | Retarget attack to the reactor | Arrow-Catching Shield |
| **A2.6** | Forced move modes on `push`/`pull` | slide, direction, distance; optional `provokeOpportunity: false` | Open Hand, Thunderwave family |
| **A2.7** | `replay` (or zone runtime hook) | Re-resolve the zone’s activity vs the entering/starting creature | Phase D0 |
| **A2.8** | `banish` / `disarm` / `breakConcentration` as steps or documented compositions | Prefer compositions of existing writes when enough | Spell pack later |

#### A3 — Window protocol checks

| Slice | Work | Done when |
|---|---|---|
| **A3.1** | Each new moment has a window id + hard/soft rule in combat-engine.md §4 | Doc + unit test collecting candidates |
| **A3.2** | Ally moments respect disposition via official token disposition / Illusive helpers only | No DAS faction dependency |

### Phase B — Table-critical reactions and defenses

Depends on: A1.1–A1.4 for Sentinel/Lucky/Sanctuary; A2.2–A2.3 for Illusory Self/Sanctuary.

#### B1 — Feats that change opportunity / reach

| Slice | Feature | Official id | Moments / steps | Notes |
|---|---|---|---|---|
| **B1.1** | Sentinel (attack on ally hit) | `sentinel` | `allyIsHit` → weapon attack offer | Hard or soft per design; spend reaction |
| **B1.2** | Sentinel (Disengage) | same | `enemyDisengages` | |
| **B1.3** | Sentinel (halt speed) on hit from OA | same | flag / control move | May trail B1.1 |
| **B1.4** | Polearm Master — bonus attack | `polearm-master` | after attack with PAM weapon | Bonus action economy |
| **B1.5** | Polearm Master — reactive strike | same | enter reach → OA-like | Needs enter-reach detection (related to A1.6 / OA) |
| **B1.6** | War Caster — spell as OA | `war-caster` | leave-reach window offers spell | Must call dnd5e activity.use |
| **B1.7** | War Caster — somatic with weapons | same | free somatic gate | Align with spell-components |

#### B2 — Attack negation / reroll defenses

| Slice | Feature | Official id | Needs |
|---|---|---|---|
| **B2.1** | Lucky (when attacked) | `lucky` | A1.1 + spend use + disadvantage |
| **B2.2** | Lucky (own rolls) if not covered | same | rollBonus / inspiration-like spend on own d20 |
| **B2.3** | Illusory Self | `illusory-self` | A2.2 `miss` + spend |
| **B2.4** | Sanctuary | `sanctuary` | A2.3 `ward` + effect match on target |
| **B2.5** | Warding Flare | `warding-flare` | `enemyAttacks` / `isAttacked`, 30 ft sight |
| **B2.6** | Protection 2024 lingering | `protection` | finish `lingeringDisadvantage` (already a step) |
| **B2.7** | Shield Master shove rider | `shield-master` | hitRider + shove save via dnd5e activity |
| **B2.8** | Shield Master interpose | same | Dex save / half on effect — verify 2024 text in catalog |

#### B3 — Save-pipeline features (no new moments)

| Slice | Feature | Official id | Hook point |
|---|---|---|---|
| **B3.1** | Evasion | `evasion` | save-resolve: Dex AoE success→0 fail→half |
| **B3.2** | Potent Cantrip | `potent-cantrip` | miss or saved cantrip → half damage, strip riders |
| **B3.3** | Sculpt Spells | `sculpt-spells` | chosen allies auto-succeed AoE saves |
| **B3.4** | Mage Slayer | `mage-slayer` | on hit concentration rules + Int/Wis/Cha save boost |
| **B3.5** | Circle of Power (magic evasion / save adv) | `circle-of-power` | aura + save pipeline |

#### B4 — Finish Illusive partials (own doc)

| Slice | Item | Source |
|---|---|---|
| **B4.1** | Ready: concentration + slot when readied (2024) | combat-engine.md Partial |
| **B4.2** | Feather Fall up to 5 creatures | same |
| **B4.3** | Deflect Energy live parity check vs Deflect Attacks | declarations already present |
| **B4.4** | Portent UI spend (step exists) | `portent` step in steps.mjs |

### Phase C — Content packs (official identifiers only)

After A0.3 cleanup. Each slice = one DAS *theme* or one class file, implemented as Illusive declarations keyed to **official** identifiers. Read DAS only as a checklist of *which* ids matter; rewrite rules from PHB/SRD citations in `catalog.mjs`.

#### C0 — Hygiene

| Slice | Work |
|---|---|
| **C0.1** | Per pack: list official ids from dnd5e SRD/premium compendium (not from memory) |
| **C0.2** | Reject any declaration that hard-codes a Foundry activity id copied from DAS comments unless verified in *this* world’s dnd5e data |

#### C1 — `triggers.mjs` gameplay leftovers (batched)

| Slice | Batch theme | Example ids (checklist; verify in compendium) |
|---|---|---|
| **C1.1** | Charm / dominate resaves on damage | charm-person, dominate-*, friends |
| **C1.2** | Fear / command / suggestion end conditions | cause-fear, command, compulsion |
| **C1.3** | Blindness/deafness, contagion, bestow curse loops | blindness-deafness, contagion |
| **C1.4** | Faerie Fire / Guiding Bolt consume-on-hit | faerie-fire, guiding-bolt |
| **C1.5** | Blade Ward / similar preAttack modifiers | blade-ward |
| **C1.6** | Remaining trigger rows after C1.1–C1.5 | rest of cleaned list |

#### C2 — Spell rules that need zones / control (after D0)

| Slice | Theme |
|---|---|
| **C2.1** | Enter/turn damage zones (spike growth, cloudkill, …) |
| **C2.2** | Walls / barriers (wall-of-fire, blade-barrier, …) |
| **C2.3** | Control denials (slow, confusion, haste limit) |
| **C2.4** | Death Ward / Power Word thresholds |
| **C2.5** | Antilife / magic globe — only if D2 antimagic not required |

#### C3 — Feats leftover after B

| Slice | Theme |
|---|---|
| **C3.1** | Crusher / Piercer / Slasher |
| **C3.2** | Crossbow Expert / Sharpshooter / Spell Sniper (2024) |
| **C3.3** | Charger / Grappler / Tavern Brawler / Unarmed Fighting |
| **C3.4** | Athlete / Speedy / Alert / Observant / Skulker |
| **C3.5** | Fighting styles Defense/Dueling if not system-native |
| **C3.6** | Epic boons (one PR per boon or small group) |

#### C4 — Classes (one subclass or feature family per slice)

| Slice | Class file | First features |
|---|---|---|
| **C4.1** | fighter | Action Surge / Indomitable / remaining maneuvers |
| **C4.2** | barbarian | Brutal Strike, Persistent Rage, Instinctive Pounce |
| **C4.3** | monk | Stunning Strike, Open Hand, Step of the Wind economy |
| **C4.4** | rogue | Cunning Strike, Assassinate, Steady Aim |
| **C4.5** | paladin | remaining auras, Channel options |
| **C4.6** | ranger | Hunter’s Prey options, Dread Ambusher |
| **C4.7** | warlock | Armor of Agathys already partial; invocations leftover |
| **C4.8** | wizard | Arcane Ward, Portent (with B4.4), Projected Ward |
| **C4.9** | sorcerer | metamagic options via existing `metamagic` step |
| **C4.10** | cleric / druid / bard | Channel, Wild Shape wire-up, Bardic leftovers |

#### C5 — Auras / emanations / monsters / ravenloft

| Slice | Pack |
|---|---|
| **C5.1** | Missing paladin/spell auras from `auras.mjs` |
| **C5.2** | Emanation monsters |
| **C5.3** | Monster basics (Pack Tactics, Flyby, Reactive, …) |
| **C5.4** | Ravenloft only if that book is in scope for the table |

#### C6 — Gear / lights / item-fixes

| Slice | Decision |
|---|---|
| **C6.1** | **Deferred under Phase 0:** only after confirming official-id primary matching |
| **C6.2** | Carried lights if Illusive lighting owner needs item table |
| **C6.3** | Skip DAS `item-fixes` wholesale; fix gaps with Illusive declarations or world content |

### Phase D — Subsystems (Illusive design, Foundry APIs)

#### D0 — Must have for spell volume

| Slice | Work | Foundry touchpoints |
|---|---|---|
| **D0.1** | Zone registry: region id ↔ source activity ↔ when[] | Measured templates / Region documents dnd5e uses |
| **D0.2** | On `enter` / turnStart / turnEnd, queue replay vs that creature | Primary writer; undo trail |
| **D0.3** | Difficult terrain / ignite hooks already partial — fold into zone | |
| **D0.4** | Forced movement helper used by steps (canvas/token updates via write gateway) | No direct client writes from players |

#### D1 — Summons and teleports

| Slice | Work |
|---|---|
| **D1.1** | Summon place: create actor/token from item activity summons data |
| **D1.2** | Summon dismiss / duration / initiative option |
| **D1.3** | Teleport: pick legal destination, then apply |
| **D1.4** | One reference spell each (e.g. Misty Step, Find Familiar) before bulk C5 |

#### D2 — Large optional planes/magic

| Slice | Work |
|---|---|
| **D2.1** | Antimagic zone suppression rules (spells, magic items) |
| **D2.2** | Ethereal condition automation on same scene |
| **D2.3** | Only if the table uses those spells |

#### D3 — Exploration adjacency

| Slice | Work |
|---|---|
| **D3.1** | Doors/locks |
| **D3.2** | Search / passive Perception prompts |
| **D3.3** | Factions — **skip** unless product wants them; disposition helpers already exist |

#### D4 — Authoring API (optional)

| Slice | Work |
|---|---|
| **D4.1** | Illusive-native declaration recipes (not DAS `content.recipes` copy) for homebrew |
| **D4.2** | Export/import declarations JSON |

### Phase E — Standing refusals (always on)

| Do | Do not |
|---|---|
| Own the combat loop exclusively | Run beside Midi-QOL / DAS · Core |
| Use dnd5e activities, rolls, effects | Reimplement dice math |
| Key new content by official `system.identifier` | Paste DAS activity UUIDs from their comments |
| Keep Illusive HUD | Adopt `darsh-dnd-ui` as a requirement |
| Compare to DAS for *coverage checklists* | Copy DAS runtime/adapter code |
| Name-regex match for DDB imports as fallback | Make DDB import ids the source of truth for automation |
| Add automation levels only if GMs ask | Block content work on essentials/assisted/full |

### Dependency graph (build order)

```text
0.1–0.3 exclusivity
    → A0 maps
    → A1 moments + A2 steps + A3 windows
        → B1–B4 table defenses
        → D0 zone replay + forced move
            → C1–C2 spells/triggers
            → C3–C4 feats/classes
            → D1 summons/teleport → C5
            → D2+ only if needed
        → C6 only after 0.2 policy confirmed
```

### Tracking

Maintain a living checklist (issue or doc section) with columns: `slice` | `status` | `official id(s)` | `tests` | `catalog rule id`. Do not mark a slice done without a catalog citation and a test.

## 12. Raw extraction

Machine-readable dump used to build this file (local temp): `%TEMP%/engine-compare-raw.json`.

Re-run:

```text
node %TEMP%/compare-engines2.mjs
node %TEMP%/compare-engines3.mjs
node %TEMP%/write-compare-doc.mjs
```
