# Feature status

What Illusive D&D 5e does today, what works with a known gap, and what is still to build. Snapshot: November 2026, Foundry 14.370 with dnd5e 6.0.6, 813 unit tests across 89 files.

- **Implemented:** automated and unit-tested.
- **Partial:** automated, with the gap written next to it.
- **Needed:** not built yet. Ordered roughly by value within each group.

Engine details are in [combat-engine.md](combat-engine.md); the per-item pack catalog is in [content-inventory.md](content-inventory.md).

---

## Implemented

### Foundation

1. **GM write gateway.** Combat writes on documents the player doesn't own run on the active GM through a Foundry query. Writes to one document are queued so they never interleave. Every write returns its own undo record (§13).
2. **Single primary writer.** Turn-change ticks, special durations, aura sync, combat-end expiry and turn triggers run on one client (the active GM, else the lowest-id active player), not once per client.
3. **Movement logged once,** on the client that moved the token; forced moves (Push) are not logged as movement.
4. **NPC reactions prompt the GM,** not the attacking player.
5. **Game-log journal.** The log is persisted by the GM on the combat and synced to every client through idempotent ops. Players apply ops immediately and reconcile when the persisted copy arrives (§14).
6. **Declared triggers.** Rules as data: moments, structured conditions, a step library, and passive, soft or hard modes that share the reaction windows (§15). Every item reaction (items 33 and 34) is a declaration; only Ready stays as code. Reaction writes (Silvery Barbs advantage, Absorb Elements and Riposte riders, Hunter's Defense resistance) are journaled for undo, and spell reactions match spell items only.
7. **Declaration sources:** shipped content (matched by item identifier, item name or effect name), item flags, and effect flags.
8. **Efficiency:**
   - a per-actor declaration index, so creatures with nothing listening are skipped;
   - lazy distance and sight facts, cached per moment;
   - debounced aura sync;
   - a reaction prompt queue (§16).
9. **2014 and 2024 rules side by side.** The edition is chosen per item, then per actor, then from the world setting. Declarations can be edition-specific.
10. **Rules catalog.** Every reaction and declaration cites a catalog id (`src/rules/catalog.mjs`); tests enforce it.

### Turn, economy and actions

11. Action, bonus action and reaction budget per turn, with Extra Attack swings.
12. Legendary and lair action spending; NPC Action / Bonus / Reaction / Legendary / Lair gems on the HUD.
13. Standard actions: Dash, Disengage, Dodge, Help (advantage consumed by the next roll), Hide, Ready.
14. Ready: a trigger (move, cast or attack), the readied activity and its range, released as a soft reaction prompt.
15. Join and leave combat from the HUD; turn tracker with groups, events, hide/reveal, defeat, minimize.

### Attacks and damage

16. A single attack pipeline:
    - roll modifiers;
    - cover baked into AC (half and three-quarters, with a soft GM prompt; total cover blocks);
    - range bands;
    - adjudication (a crit still hits);
    - one HP write per hit.
17. Roll modifiers: conditions, Hex, Help, the Silvery Barbs grant, flanking, Faerie Fire, Reckless Attack, Great Weapon Master, Sharpshooter, Vex, Sap.
18. Hit riders, all in the same HP write as the weapon damage:
    - Divine Smite and Sneak Attack (prompted);
    - Hex and Hunter's Mark (automatic, only on the marked creature);
    - Colossus Slayer and Divine Fury (once per turn).
19. All 8 weapon masteries, including the extra Cleave swing; Graze and Cleave damage are on the undo trail.
20. Damage adjustments: immunity, resistance and vulnerability, plus reduction, multiplication and added resistance from reactions and triggers.
21. Concentration DC from the HP actually lost; immunity skips the check.
22. Melee knock-out choice at 0 HP.
23. Death saves, stabilize, defeated state, inspiration (party status HUD).

### Spells, saves and areas

24. Activity drive for attack, damage, heal, save, check, summon and forward activities, plus Ice Knife follow-ups.
25. Area placer: Illusive's own preview creates the area Region on confirm (circle, cone, line, rectangle, emanation; token-attached when not stationary).
26. Area saves: walls-aware auto-targeting and saves; areas placed outside a driven use auto-save when the Region is created.
27. Counterspell: the action stays spent; 2024 refunds the slot, and the 2014 counter level comes from the slot picker.
28. Mechanical auras: Protection, Courage, Devotion, Life, Purity, and the Spirit Guardians damage aura.
    Declared auras: any active effect with `flags.illusive-dnd-5e.aura` (radius, allies / enemies / any, self, combat-only) copies its changes, statuses and over-time damage onto tokens in range (Pass without Trace, Silence, Spirit Shroud, Crusader's Mantle, Holy Aura, Flaming Sphere, Pack Damage).
29. Over-time effects: turn-start and turn-end damage and saves (`flags.illusive-dnd-5e.overTime`).
30. Special durations: next attack, is attacked, is damaged, turn, the source creature's turn start / end, current turn end, rest, combat end.

### Reactions

31. Hybrid windows: hard windows pause the action that triggered them, soft windows prompt without waiting. Reactors are ordered by initiative, with one prompt per creature listing everything it can use.
32. Prompts appear on the reacting player's own screen, with a fallback if they disconnect.
33. Hard reactions:
    - opportunity attacks (the move is held until resolved);
    - Shield, Parry, Protection, Interception;
    - Counterspell, Silvery Barbs (attacks, saves and checks), Cutting Words;
    - Countercharm (2024), Uncanny Dodge, Absorb Elements (with next-turn rider);
    - Deflect Missiles / Attacks / Energy, Stone's Endurance, Superior Hunter's Defense;
    - Feather Fall, Slow Fall.
34. Soft reactions: Hellish Rebuke, Storm's Thunder, Wrath of the Storm, Retaliation, Riposte, Ready.
35. dnd5e 6 falls: damage goes to the creature that fell, prone on damage, Feather Fall / Slow Fall window.

### Declared rules (shipped content)

36. Blur: attacks against you have disadvantage unless the attacker has Blindsight or Truesight.
37. Protection from Evil and Good: attacks from aberrations, celestials, elementals, fey, fiends and undead have disadvantage.
38. Armor of Agathys: 5 cold per slot level to a melee attacker while you have temp HP.
39. Heavy Armor Master: 2024 reduces B/P/S damage from attacks by your proficiency bonus; 2014 reduces weapon damage by 3.
40. Dark One's Blessing: temp HP equal to Cha mod + warlock level when you drop a hostile creature to 0.
41. Defensive Duelist: hard reaction, +PB AC against a melee hit while wielding a Finesse weapon.

### Movement and perception

42. Movement budget enforced in combat, movement modes, click-to-move pathing, movement undo per step or per drag.
43. Push and other forced moves don't provoke opportunity attacks.
44. Vision and lighting evaluation (line of sight, light level, senses), obscurement, passive Perception display.

### Game log and undo

45. LIFO game log per turn: actions, reactions under their parent, movement, system rows.
46. Undo a row (reactions first, then the parent), rewind a turn, or rewind a round.
47. Undo cascades across turns through `dependsOn`: undoing a cast also undoes the over-time ticks and trigger writes its effect caused.
48. Automatic writes are journaled: over-time ticks, expiring effects, mastery side effects and trigger writes.
49. HP undo is a delta, so later healing or damage isn't overwritten.
50. Undo is blocked while a hard reaction window waits; undoing a row dismisses its pending soft prompts.
51. GM correction of the last completed resolution.

### HUD and table

52. HUD: action bar, camera pad, token statuses, token auras, party status, boss bar, turn tracker.
53. Mobile sheet and a connection QR code for phones.
54. Loot transfer between actors.
55. Animation hook `illusive-dnd-5e.combatFx` (attack hit / miss, reactions, mastery). Every die is a chat roll, so Dice So Nice shows it: hit riders, over-time damage and declaration dice included. Forced saves and checks (spell saves, Topple, concentration, over-time, Counterspell) roll on the creature owner's client: a player clicks the roll in dnd5e's dialog (closing it rolls normally), NPC saves roll on the GM without one. No answer in 60 s rolls on the resolving client (`src/application/dice.mjs`). Dice So Nice is optional: without it the same rolls show as chat cards.
56. Gated debug logging by channel.
57. **Animations** (`src/animation`). Automated Animations plays an item it recognises, including a translated name matched back to its English entry. Otherwise Sequencer plays a free JB2A effect for impacts, areas and auras. Token Magic FX, then a plain ring, covers a table with neither. `relevantAnimations` names the fresh Sequencer effects a resolution could wait for; hit points are not delayed on them yet.

---

## Partial

1. **Soft prompts** relay to the owner but hold nothing if the owner is offline (by design: the parent never waits).
2. **Ready:** a readied spell spends its slot on release (no concentration hold); "something else" triggers stay manual.
3. **Protection (2024):** only the triggering attack gets disadvantage; the lingering version is manual.
4. **Feather Fall** covers the faller only.
5. **Check reactions** fire for Illusive-driven checks only; free checks from the HUD drawer consume a Silvery Barbs grant but open no window.
6. **Declared content gaps:**
   - Armor of Agathys doesn't end its own effect when the temp HP run out.
   - Heavy Armor Master 2014 doesn't check for magical weapons.
   - Dark One's Blessing doesn't check the 2024 "within 10 feet" wording.
   - Protection from Evil and Good doesn't automate the charm, fright and possession protection.
7. **Prompted declarations** (soft / hard) need a source item with an activity. Effect-only declarations can be passive only, and turn moments are passive only.
8. **Direct writes outside the gateway:** economy budget, movement flags, legendary / lair resources, feature toggles and HUD sheet edits still write directly. They are all on the acting user's own documents, so they work, but they don't return undo records through the gateway.
9. **Rest and combat-end expiry** delete effects without a game-log row (nothing to rewind into).
10. **Multiplayer** is unit-tested only: the reaction relay, the gateway and the journal need a live multi-client playtest.

---

## Needed

### Foundation (finish the engine)

1. **Port the remaining rules onto declarations:** hit riders (Smite, Sneak Attack, Hex), masteries, auras and over-time. Reactions are done. Each port's test: this declaration produces this patch.
2. **More moments:** `preAttackRoll`, `isTargeted`, `preDamageRoll`, `gainsCondition`, area enter / leave / per-square, `disengages`, `rest`. Plus ally and enemy variants (`allyIsHit`, `enemyAttacks`).
3. **More steps:**
   - bonus damage;
   - make a save;
   - push / pull;
   - mark;
   - create zone;
   - grant a free reaction;
   - restrict actions.
4. **Effects that end themselves:** repeat saves (Hold Person), ends-on-action (Invisibility, Sanctuary), and effects that fire at the start of the caster's turn.
5. **Content layers:** shipped data, then world overrides, then item flags, so a GM can fix or add rules without code.
6. **Resume after refresh:** persist each resolution step before running it, with command ids so a re-run is harmless.
7. **Batch writes:** one write per document per step, one chat card update per step.
8. **Spatial pre-filter:** consider only tokens within the largest range any declaration for that moment uses.
9. **Unowned-write audit:** move the remaining direct writes (Partial item 8) onto the gateway so they are journaled too.

### Combat rules

10. Grappling: drag the grappled creature, escape checks.
11. Control spells: Command, Fear, Confusion, Slow (action restrictions).
12. Wild Shape.
13. Metamagic.
14. Bardic and Heroic Inspiration, Portent.
15. Healing pools (Lay on Hands) driven from the HUD.
16. Contested checks.
17. Improvised weapons; projectiles as separate uses.
18. Monster abilities beyond Parry: Legendary Resistance logic, recharge abilities, Redirect Attack, Split.
19. Per-spell and per-feature rules at scale (DAS ships ~267 spells and ~186 features as rules; we special-case about 40).

### Areas and terrain

20. Moving zones (Moonbeam, Flaming Sphere).
21. Lingering terrain: caltrops, oil, Web, and oil or webs catching fire.
22. Per-square damage (Spike Growth).

### Movement

23. 3D pathing with scene levels; climbing walls and ceilings.
24. Jumping, pulling up onto a ledge, flying take-off and landing.
25. Teleporting without opportunity attacks.

### Perception and exploration

26. Stealth with a hiding DC, a Search action, hearing.
27. Factions with derived dispositions; out-of-combat stealth and vision cones.
28. Doors and locks: pick or force against a hidden DC, or use a key.
29. The Ethereal Plane.

### Table tools

30. GM-requested and group rolls, each on the player's own screen.
31. A plain-dnd5e escape per use, and a theatre-of-the-mind switch.
32. An automation badge on every item: rule, automatic, passive or manual.
33. A GM waiting panel: see who is being waited on, force an answer, unlimited wait.
34. One settings window with search.
35. A world diagnostic: back up, then repair known-bad imported item data.
36. Translations (strings already go through `illusiveDnd`; a language file is mostly extraction).

### HUD

37. Weapon sets (up to six, drag a weapon into a set).
38. Hide and Climb buttons out of combat.
39. A fold-away bar.

### Testing and release

40. A scenario runner inside Foundry (GM macro or Quench): build a scene, run actions, assert HP, effects and the log. One scenario per rule family, then per class.
41. Tests on every push, plus release notes per version.

### Separate products (out of scope for the engine)

42. Loot and trade: corpse search, CR-based treasure, locked containers, pickpocketing, merchants (Item Piles covers this today).
43. Shadows and ambience: contact shadows, flying bob, blur beyond darkvision, scene transitions.
44. Homebrew creator: build declarations without code, on top of the declaration schema.
