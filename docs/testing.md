# Testing

Click-through for a Foundry world. The last recorded unit run is 100 files, 971 tests: `npx vitest run` from the module root. A box here means a person saw the result on the table. Foundry 14.370, dnd5e 6.0.6.

Use a player client and a GM client, with at least two creatures in combat. Where a rule names an edition, run it once on a 2024 item and once on a 2014 item. Advantage and disadvantage from two different sources cancel.

A few rules have a step and no button. Those are in [Engine steps](#engine-steps). Put this on any owned item, then take the action named in the check. `on` is the moment, `do` is the step.

```json
{
  "flags": {
    "illusive-dnd-5e": {
      "triggers": [{
        "id": "probe",
        "on": "turnStart",
        "if": { "self.isTrigger": true },
        "do": [{ "step": "note", "text": "probe" }]
      }]
    }
  }
}
```

## Two clients

- [ ] A player attacking a GM-owned creature changes that creature's hit points. The write happens on the GM.
- [ ] Two writes to the same creature, fired together, land one after the other.
- [ ] Turn-start damage, aura copies, and effect expiry happen once when two clients are connected, not once per client.
- [ ] An NPC reaction prompt opens on the GM, not on the player who caused it.
- [ ] A player reaction prompt opens on that player's screen.
- [ ] The game log on the player matches the GM after the GM's copy arrives. Doing the same undo twice does not undo twice.
- [ ] A player who disconnects during their own reaction prompt does not freeze the rest of the table. A hard window still needs an answer from someone who is connected.

## Action bar

- [ ] The bar shows Items, Action, Bonus, Reaction, and, on a creature that has them, Legendary and Lair.
- [ ] A spell with no target opens the target picker and does not cast until a target is chosen. A second click with a target casts.
- [ ] An upcast spell asks for the slot. The chosen level is the level that resolves.
- [ ] A weapon with Extra Attack can swing again after the action is spent. A second different weapon cannot.
- [ ] The tooltip names the activation, the range, and a missing target when the button needs one.
- [ ] Join combat adds the selected token. Leave combat removes it. Outside combat the same control offers a rest.
- [ ] Resting expires effects whose special duration is that rest, and publishes the rest moment.
- [ ] Minimizing the bar keeps it usable. Restoring it puts the same sections back.

## Turn tracker

- [ ] The tracker follows the combat turn. Groups share a card.
- [ ] Next turn, previous turn, next round, and previous round match Foundry's combat.
- [ ] GM: Set as Current Turn jumps the combat to that card.
- [ ] GM: Reroll Initiative, Set Initiative, and Clear Initiative change that card, and a group changes every member.
- [ ] GM: Hide from Players removes the card from the player client. Reveal puts it back.
- [ ] GM: Mark Defeated sets defeated and the dead overlay. Unmark clears both.
- [ ] An event combatant can be edited. A creature card cannot.
- [ ] Target, Pan, and Ping use the token on that card. Targeting a group targets every member.
- [ ] The tracker can be moved and minimized, and it stays where it was put after a reload.

## Party, boss, camera

- [ ] Party portraits show the party. A long list scrolls.
- [ ] A portrait menu can select, ping, open the sheet, target, and, for the GM, set the turn or mark defeated.
- [ ] The rail can be resized from its own menu and minimized.
- [ ] Inspiration on a party portrait matches the actor.
- [ ] A boss bar tracks the chosen creature's hit points, including temporary hit points, and hides when that creature is not on the canvas.
- [ ] The camera pad pans and zooms. It sits above the action bar. It is absent for a client who is not allowed to have it.
- [ ] A tabletop client that is not the pilot has no pad. The pilot's pad moves the table. Recenter returns the locked view.
- [ ] The connection QR opens and a phone can join from it.

## Phone sheet

- [ ] The phone shows one tab at a time: abilities, combat, inventory, features, spells, effects. Switching tabs does not rebuild the other lists until that actor changes.
- [ ] Using a spell or weapon from the phone spends the same economy as the desktop bar and picks targets on the phone.
- [ ] Moving from the phone spends speed and offers opportunity attacks.
- [ ] Dice on the phone show in chat. With Dice So Nice they also animate.

## Loot

- [ ] Giving an item to another creature moves the quantity asked for and leaves the rest.
- [ ] Giving more than the stack contains is refused.
- [ ] Dropping an item puts it on the ground and removes it from the giver.
- [ ] A creature cannot give an item to itself.

## Turn and economy

- [ ] Action, bonus action, and reaction each spend once and return at the start of that creature's next turn.
- [ ] Legendary and lair actions spend their own budget.
- [ ] Dash doubles movement for the turn.
- [ ] Disengage stops opportunity attacks until the creature's next turn.
- [ ] Dodge imposes disadvantage on attacks against the creature until its next turn.
- [ ] Help gives the chosen creature advantage on its next attack or check against any attacker, then the advantage is gone.
- [ ] Hide asks for a Stealth check.
- [ ] Readying a move or an attack prompts when that trigger happens, and only within the readied activity's range.
- [ ] Readying a spell spends the slot and starts concentration immediately.
- [ ] Releasing the readied spell does not spend a second slot.
- [ ] Letting the readied spell lapse removes the concentration and does not refund the slot.

## Movement and senses

- [ ] A creature cannot move farther than its remaining speed. Clicking a destination paths along the grid.
- [ ] Walk, fly, swim, and climb each spend their own speed.
- [ ] Undo of a drag restores the whole drag. Undo of a single step restores that step.
- [ ] Leaving an enemy's reach offers that enemy an opportunity attack, and the move waits until the attack is taken or passed.
- [ ] Disengage, a push, a pull, and any forced move from this module do not offer opportunity attacks.
- [ ] A zone marked difficult costs double movement. Ordinary ground does not.
- [ ] An attacker who cannot see the target has disadvantage. An attacker the target cannot see has advantage. Both together cancel.
- [ ] A lightly obscured target imposes disadvantage on a Wisdom (Perception) check.
- [ ] Darkness and a creature's darkvision, blindsight, and truesight match who can see whom. Passive Perception is shown for the viewed token.
- [ ] A push is not a second movement row in the game log. The client that dragged the token is the only one that logs that move.

## Attack conditions

- [ ] Poisoned, frightened of the target, restrained, blinded, and an unseen attacker each impose disadvantage.
- [ ] A prone target gives disadvantage on a ranged attack and advantage on a melee attack from 5 feet.
- [ ] A paralyzed, stunned, unconscious, petrified, or incapacitated target grants advantage.
- [ ] Invisible target: disadvantage. An invisible attacker the target cannot see: advantage.
- [ ] Faerie Fire or a Guiding Bolt glow on the target grants advantage.
- [ ] Flanking grants advantage.
- [ ] Reckless Attack, while toggled, grants advantage and the attacker can be attacked with advantage until its next turn.
- [ ] Great Weapon Master, while toggled, on a melee heavy weapon takes the attack penalty and adds the damage bonus.
- [ ] Sharpshooter, while toggled, on a ranged weapon takes the attack penalty and adds the damage bonus.
- [ ] A Hex or Hunter's Mark curse imposes disadvantage on ability checks with the named ability.
- [ ] Half cover and three-quarters cover raise AC. The GM can accept or change the cover. Total cover blocks the attack.
- [ ] A ranged attack past normal range has disadvantage. A melee attack at long reach does not.
- [ ] A critical hit still hits. Shield cannot turn it into a miss.

## Damage, concentration, death

- [ ] A hit writes one HP change that includes the weapon damage and any rider added to that same hit.
- [ ] Immunity, resistance, and vulnerability change the HP actually lost.
- [ ] Concentration uses the HP actually lost. Immunity to the damage skips the check. The save is rolled by the concentrating creature's owner.
- [ ] Dropping a creature to 0 with a melee attack offers the knockout choice.
- [ ] Death saves, three successes stabilizing, three failures dying, and the defeated tracker state match.
- [ ] Healing that raises current HP expires effects whose special duration is "healed". Temporary hit points do not.
- [ ] Undo restores hit points as a delta, so a later heal is not overwritten by undoing an earlier hit.
- [ ] Undo restores the spent slot or action and any reaction that hung off that action.
- [ ] Undo is refused while a hard reaction window is still open. Undoing a row dismisses soft prompts that were waiting on it.
- [ ] The log is newest first. A reaction sits under the action that caused it. Rewind turn and rewind round put those rows back in order.
- [ ] Undoing a cast also undoes the later ticks and trigger writes that cast caused, including ticks on a later turn.
- [ ] The GM can correct the last completed resolution.

## Activities

- [ ] An attack activity rolls the attack, then damage on a hit.
- [ ] A save activity places its template when it has one, then each creature inside saves. Walls block the area.
- [ ] A heal activity restores hit points to the chosen creatures.
- [ ] A check activity rolls the check. Meeting the DC opens the check-success window.
- [ ] A summon activity lets dnd5e place the summon.
- [ ] A forward activity continues into the attack, save, or damage that follows it. Ice Knife's blast is the follow-up save, not a second cast.
- [ ] A spell with no components listed in its data can still be countered. A spell whose component list is empty cannot.
- [ ] Placing a circle, cone, line, rectangle, or emanation previews it, then creates a region. A token-attached area follows its token. A stationary one does not.
- [ ] An area created outside a cast still asks for saves when the region appears.

## Spell components

- [ ] A silenced creature cannot cast a spell that still has a verbal component. The action and the slot are not spent.
- [ ] Subtle Spell lets that same creature cast it.
- [ ] A creature with a weapon and a shield equipped cannot cast a spell that still has a somatic component.
- [ ] Subtle Spell lets that same creature cast it. A two-handed weapon alone still leaves a hand free.
- [ ] A material component stays perceptible, so Counterspell can still answer a Subtle spell that has one.

## Metamagic

Set `flags.illusive-dnd-5e.metamagic` to the option before the cast. The cast clears it when the spell resolves. There is no sheet button that spends sorcery points.

- [ ] Subtle strips verbal and somatic, as above.
- [ ] Distant doubles the range used for that cast and does not change the item.
- [ ] Extended doubles the duration of the effect the cast applies.
- [ ] Careful makes each ally automatically succeed on a save step. It does not change a dnd5e activity save or a zone save.
- [ ] Heightened makes every target of a save step roll with disadvantage. It does not change a dnd5e activity save or a zone save.
- [ ] Empowered rerolls the lowest damage dice, up to the Charisma modifier, after the damage roll.
- [ ] Twinned adds a second target, and refuses a third.
- [ ] Quickened spends a bonus action instead of an action.

## Weapon masteries

- [ ] Graze deals ability-modifier damage on a miss.
- [ ] Cleave makes one extra attack against a creature next to the original target.
- [ ] Nick lets the light extra attack happen as part of the Attack action.
- [ ] Push moves the target 10 feet and does not offer an opportunity attack.
- [ ] Sap gives the target disadvantage on its next attack, then that disadvantage is gone.
- [ ] Slow reduces the target's speed by 10 feet.
- [ ] Topple asks for a Constitution save. Failure knocks the target prone.
- [ ] Vex gives advantage on the next attack against that same target, then that advantage is gone.

## Reaction windows

- [ ] A hard window pauses the attack, cast, save, or move until every reactor has answered or passed. A soft window does not.
- [ ] One creature gets one prompt listing every reaction it can use on that window.
- [ ] Reactors are asked in initiative order.
- [ ] Passing spends nothing.
- [ ] Using a reaction spends the reaction. A second reaction on the same turn is refused unless a step granted another one.
- [ ] Spell reactions match a spell item only. A feature named Shield does not offer the Shield spell.

## Hard reactions

- [ ] Opportunity attack: a melee weapon attack against a creature that left reach. Passing lets the move finish.
- [ ] Shield: +5 AC against the hit.
- [ ] Parry: AC bonus against a melee hit.
- [ ] Counterspell: the cast stops, the action stays spent, and a 2024 counter refunds the slot. A 2014 counter asks for the slot level.
- [ ] Silvery Barbs on an attack, a successful save, or a successful check: the roll is rerolled and kept if lower, then an ally gets advantage on its next roll.
- [ ] Cutting Words: the attack roll loses a Bardic Inspiration die.
- [ ] Protection: the attack has disadvantage while the protector is next to the ally, wields a shield, and can see the attack. The attacker keeps disadvantage against that ally until it is used.
- [ ] Countercharm: a failed charm or fear save by an ally within 30 feet can be rerolled with advantage.
- [ ] Uncanny Dodge: the hit's damage, riders included, is halved.
- [ ] Absorb Elements: resistance to the elemental damage of that hit, then extra melee damage of that type on the caster's next turn only.
- [ ] Deflect Missiles: reduces a ranged weapon attack by 1d10 + Dexterity modifier + monk level.
- [ ] Deflect Attacks: reduces bludgeoning, piercing, or slashing from an attack by that same amount.
- [ ] Deflect Energy: reduces the damage of an attack by that same amount.
- [ ] Stone's Endurance: reduces damage by 1d12 + Constitution modifier.
- [ ] Superior Hunter's Defense: resistance to the triggering damage types until the current turn ends.
- [ ] Interception: reduces a nearby ally's attack damage by 1d10 + proficiency bonus.
- [ ] Feather Fall: the falling creature and up to five creatures within 60 feet take no falling damage from this fall. A later fall while the effect remains also deals none. The fall still knocks the creature prone when the damage would have.
- [ ] Slow Fall: falling damage is reduced by 5 times monk level.
- [ ] Defensive Duelist: +proficiency bonus AC against a melee hit while wielding a finesse weapon.

## Soft reactions

- [ ] Hellish Rebuke, Storm's Thunder, and Wrath of the Storm offer the feature's own activity. Wrath of the Storm only answers an attack within 5 feet.
- [ ] Retaliation offers a melee weapon attack within 5 feet.
- [ ] Riposte offers a melee weapon attack after a melee miss within 5 feet, spends a superiority die, and adds that die to the hit. It is refused with no superiority dice left.

## Always on

- [ ] Blur: attacks against the creature have disadvantage unless the attacker has blindsight or truesight.
- [ ] Protection from Evil and Good: attacks from an aberration, celestial, elemental, fey, fiend, or undead have disadvantage. Charmed, frightened, and possessed from those creature types are removed.
- [ ] Armor of Agathys: a melee hit while temporary hit points remain deals 5 cold damage per slot level to the attacker. The effect ends when those temporary hit points are gone.
- [ ] Heavy Armor Master, 2024: bludgeoning, piercing, and slashing from an attack are reduced by the proficiency bonus while wearing heavy armor.
- [ ] Heavy Armor Master, 2014: the same damage from a nonmagical weapon is reduced by 3. A magical weapon is not reduced. The 2024 rule does not also fire on a 2014 item.
- [ ] Dark One's Blessing: dropping a hostile creature to 0 within 10 feet grants temporary hit points equal to Charisma modifier + warlock level, minimum 1. A creature farther than 10 feet does not.

## Hit riders

- [ ] Divine Smite, Sneak Attack, and Eldritch Smite ask, then add that item's damage roll to the same hit. Refusing adds nothing.
- [ ] Hex and Hunter's Mark add their damage only when the target is already marked by that caster. An unmarked target gets nothing.
- [ ] Colossus Slayer adds 1d8 once on the creature's turn. A second hit the same turn does not.
- [ ] Divine Fury adds 1d6 plus half barbarian level radiant damage once on the creature's turn.

## Auras and over time

- [ ] Aura of Protection adds the paladin's Charisma modifier, minimum +1, to allies' saves, and grows with the paladin aura. It stops while the paladin is incapacitated.
- [ ] Aura of Courage: allies are immune to frightened. Aura of Devotion: allies are immune to charmed.
- [ ] Spirit Guardians: enemies who start their turn in the aura take 3d8 radiant, Wisdom save for half. It requires concentration.
- [ ] Aura of Life: allies have resistance to necrotic. Aura of Purity: allies are immune to blinded, charmed, deafened, frightened, paralyzed, poisoned, and stunned.
- [ ] An effect with `flags.illusive-dnd-5e.aura` copies its changes onto tokens in its radius. Allies, enemies, and any are separate. A combat-only aura drops when combat ends. Leaving the radius removes the copy.
- [ ] An effect with `flags.illusive-dnd-5e.overTime` deals its damage or asks for its save at the start or the end of the turn, once.
- [ ] Special durations expire on the named event and not before: turn start, turn end, current turn end, the source creature's turn start, the source creature's turn end, taking an action, the next attack, being attacked, taking damage, regaining hit points, a short rest, a long rest, combat end.

## Zones

- [ ] A zone that follows its caster moves with that token and does not tick twice for the same step.
- [ ] Moonbeam: casting it places a 5-foot zone that does not follow the caster. A creature that enters it or starts its turn there makes a Constitution save for 2d10 radiant, half on a success. The bonus-action button Move Moonbeam slides that zone up to 60 feet toward a target and spends the bonus action.
- [ ] Web: a creature that enters makes a Dexterity save or is restrained. The ground is difficult terrain. Fire burns the webs for 2d4 at the start of a turn inside them, then the webs are gone.
- [ ] Oil: the ground deals nothing until fire damage hits a creature standing in it. It then deals 5 fire damage when a creature enters or starts its turn there.
- [ ] Caltrops: a creature that enters makes a Dexterity save, DC 15, or takes 1 piercing and loses 10 feet of speed until it regains hit points.
- [ ] A zone whose `when` is `square` deals its damage once per 5 feet moved through it.

## Falling

- [ ] Falling damage is applied to the creature that fell, not to whoever was last targeted.
- [ ] Damage of 1 or more knocks that creature prone.
- [ ] Feather Fall and Slow Fall are offered before the hit points are written.

## Dice and animation

- [ ] Every attack, damage, rider, save, check, zone, and over-time roll appears in chat.
- [ ] A player save or check opens dnd5e's roll dialog for that player. Closing it rolls normally. An NPC rolls on the GM with no dialog. No answer within 60 seconds rolls on the resolving client.
- [ ] With Dice So Nice, those rolls animate. Without it, the chat card is the only result.
- [ ] Automated Animations plays an item it recognises, including a translated name matched back to the English item.
- [ ] With Automated Animations off, Sequencer plays a JB2A effect for an impact, an area, and an aura. With Sequencer off, Token Magic FX plays. With neither, a plain ring plays.
- [ ] The hook `illusive-dnd-5e.combatFx` fires for a hit, a miss, a reaction, and a mastery.

## Engine steps

These have no feature on a character sheet. Attach the flag from the top of this file, set `on` and `do` as written, and use a turn start unless the check names another moment. Chat should show the note only when the check says so. The other checks should show the rule.

- [ ] `grapple`, moment `isHit`, target the defender. A failed Strength or Dexterity save applies grappled. Dragging the grappler pulls the grappled creature along. The pull does not offer an opportunity attack.
- [ ] `contest`, with `ability`, `vs`, and `onWin`. The source's check against the target's check applies the named status only when the source's total is higher.
- [ ] `control` with `deny` listing `action`, `bonus`, `reaction`, or `move`. That budget cannot be spent.
- [ ] `control` with `order` of `halt`, `grovel`, or `drop`. The creature cannot take the forbidden action.
- [ ] `control` with `order` of `approach` or `flee`. Ordinary movement that does not obey is refused. The forced step does not offer an opportunity attack.
- [ ] `control` with `slow`. Speed is halved and AC drops by 2.
- [ ] `control` with `confusion`. At the start of the turn a d10 is rolled: 1 denies every action, 2–6 moves the creature 15 feet at random and denies its action, 7–8 moves it toward the nearest enemy, 9–10 ends the effect. A roll that cannot be made leaves the creature able to act.
- [ ] `pull` with `feet`. The target moves toward the source by that many feet and does not offer an opportunity attack.
- [ ] `mark`. The target gains an effect named Hex with the marked status, and the caster is the origin. A later hit from that caster can add Hex or Hunter's Mark damage.
- [ ] `freeReaction`. The creature can take a reaction after it has already used one this turn.
- [ ] `repeatSave` with an ability, a DC, and a name. At the start of the creature's turn it saves. Success ends the named effect.
- [ ] `endOnAction` with a name. Taking an action ends that effect. A bonus action does not.
- [ ] `moveZone` with `feet`, moment `turnStart`, and a target. A movable zone whose source is this token slides toward the target by at most that many feet.
- [ ] `ignite`, moment `isHit`, target a creature standing in terrain. That terrain starts dealing fire damage.
- [ ] `metamagic` with `option` and `resource`. The named resource drops by the option's cost and the cast flag is set. Quickened costs 2. Heightened costs 3. The others cost 1.
- [ ] `wildShape` with `beast` set to a beast actor uuid. Hit points, speed, senses, and size become the beast's. If the actor has no `transformInto`, the beast's weapons are added and removed when a second step `wildShape` with `end` runs. If the actor has `transformInto`, that transform runs and the weapons are not copied.
- [ ] `inspiration`. The first use grants Heroic Inspiration. A second use with `spend` removes it and grants advantage on the next d20.
- [ ] `portent` with `mode` `store` and `dice` 2, on `attackDeclared`. Two d20s are stored. A following `portent` with `mode` `replace` uses one of them instead of the roll.
- [ ] `layOnHands` with `value` and `max`. The pool starts at max, the heal spends it, and a later use cannot spend more than what remains.
- [ ] `legendaryResistance`, moment `failedSave`. The failed save becomes a success and one use is spent. Refusing the dialog leaves the failure.
- [ ] `recharge` with `item`. That item's uses refresh when its recharge roll succeeds.
- [ ] `redirect`, moment `isHit`, on an ally next to the original target. The hit is resolved against the ally instead.
- [ ] `split`, moment `turnStart`, on a creature at 0 hit points. It stands at half its hit points and a copy is created.
- [ ] `aura` with `feet`. Allies in that radius receive the copied aura. The copy drops when they leave.

## Do not expect these yet

- [ ] Moonbeam does not give shapechangers disadvantage. Its save DC is the Wisdom formula on every caster.
- [ ] Web does not ask for a save at the end of the restrained creature's turn.
- [ ] Casting Hex or Hunter's Mark does not place the mark. Only the `mark` step, or an effect that already exists, does.
- [ ] A spell whose only rule is its dnd5e activity needs no extra result from this module. Fireball is the save activity. Cure Wounds is the heal activity.
- [ ] No sheet button spends sorcery points, enters Wild Shape, uses Portent, uses Lay on Hands, or spends Legendary Resistance. The checks above are the flag, not the class feature.
- [ ] There is no 3D path, jump, or climb onto a ledge. Misty Step moves you to 5 feet from the selected creature when that space is within 30 feet. Dimension Door and the other teleport spells use dnd5e's Teleport button.
- [ ] Hide does not set a hiding DC, and there is no Search action.
- [ ] Knock and Arcane Lock do not change a lock. Merchants and a homebrew rules editor are not part of this module. Blink and Etherealness set the ethereal status and leave the token on this scene.
