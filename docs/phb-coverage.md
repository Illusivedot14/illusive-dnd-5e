# Features covered / not covered

Written from the packs installed with dnd5e 6.0.6 on this computer. Foundry's product entry for the Player's Handbook points at `classes24`, `origins24`, `feats24`, and `spells24`. Each pack is flagged `sourceBook: SRD 5.2`. The retail 2024 Player's Handbook, per D&D Beyond's update post, is 391 spells, 75 feats, 12 classes, and 48 subclasses. Spells and feats in that book that are not in these packs are not on this computer and are not named below.

A short name in parentheses is the value Foundry stores on the item (`system.identifier`). Misty Step is `misty-step`.

An item is in one list:

- **Instruction.** `src/content/` matches the item, or an effect on the item. The sentence is the instruction's own note.
- **Sheet result.** The item deals damage, heals, transforms, or has an effect that changes a number or sets a status. dnd5e performs that activity. This module does not add a second roll.
- **Sheet summon.** The item has a summon activity. dnd5e places the creature.
- **Sheet teleport button.** The item has a teleport activity. dnd5e adds a Teleport button to the chat card. The button plans movement. It does not move the token until that button is used.
- **Roll with no result.** The item asks for an attack, save, or check, and the activity has no damage and no effect that changes a number or sets a status.
- **No activity.** The item has none of the above and no instruction.

## Counts

| Pack | Items | Instruction | Sheet result | Sheet summon | Sheet teleport button | Roll with no result | No activity |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| spells24 | 341 | 58 | 152 | 34 | 7 | 14 | 76 |
| feats in feats24, classes24, and origins24 | 308 | 49 | 94 | 5 | 0 | 1 | 159 |
| classes24 class and subclass records | 24 | | | | | | |
| origins24 species and backgrounds | 18 | | | | | | |

Instructions in `src/content/` that match none of these items: 89.

## Spells with an instruction

58 spells.

- Antilife Shell (antilife-shell), level 5. Sheet activity: utility. Matched by item. A 10-foot circle that follows you. Other creatures cannot enter it. You can. It does not block spells.
- Antimagic Field (antimagic-field), level 8. Sheet activity: utility. Matched by item. A 10-foot circle that follows you. A spell cast by a creature inside it is cancelled. The slot is still spent.
- Aura of Life (aura-of-life), level 4. Sheet activity: heal. Matched by item. No note on the instruction.
- Bestow Curse (bestow-curse), level 3. Sheet activity: save. Matched by item. No note on the instruction.
- Blade Barrier (blade-barrier), level 6. Sheet activity: save. Matched by item. A 20-foot area, not a wall. Entering or starting a turn there: Dexterity save, 6d10 slashing, half on a success. It does not block movement.
- Blindness/Deafness (blindness-deafness), level 2. Sheet activity: save. Matched by item. No note on the instruction.
- Blur (blur), level 2. Sheet activity: utility. Matched by effect name. No note on the instruction.
- Calm Emotions (calm-emotions), level 2. Sheet activity: save. Matched by item. Each target makes a Charisma save. A failure removes charmed and frightened.
- Charm Monster (charm-monster), level 4. Sheet activity: save. Matched by item. No note on the instruction.
- Charm Person (charm-person), level 1. Sheet activity: save. Matched by item. No note on the instruction.
- Cloudkill (cloudkill), level 5. Sheet activity: save. Matched by item. No note on the instruction.
- Command (command), level 1. Sheet activity: save. Matched by item. No note on the instruction.
- Compulsion (compulsion), level 4. Sheet activity: save. Matched by item. No note on the instruction.
- Confusion (confusion), level 4. Sheet activity: save. Matched by item. Wisdom save or an effect named Confusion. The random action each turn is the existing confusion ticker when that effect is present.
- Contagion (contagion), level 5. Sheet activity: save. Matched by item. No note on the instruction.
- Counterspell (counterspell), level 3. Sheet activity: save. Matched by item. No note on the instruction.
- Death Ward (death-ward), level 4. Sheet activity: utility. Matched by item. Casting applies an effect named Death Ward. That effect is what heals the creature at 0 hit points. When the warded creature is damaged to 0 hit points, it drops to 1 and the effect ends.
- Dispel Evil and Good (dispel-evil-and-good), level 5. Sheet activity: save, utility. Matched by item. Using the spell removes charmed, frightened, and possessed from you. Dismissal off the plane is not implemented. A celestial, elemental, fey, fiend, or undead that fails a Charisma save is hidden and marked defeated in this combat. It is not moved to another scene.
- Divine Smite (divine-smite), level 1. Sheet activity: damage. Matched by item. No note on the instruction.
- Dominate Beast (dominate-beast), level 4. Sheet activity: save. Matched by item. No note on the instruction.
- Dominate Monster (dominate-monster), level 8. Sheet activity: save. Matched by item. No note on the instruction.
- Dominate Person (dominate-person), level 5. Sheet activity: save. Matched by item. No note on the instruction.
- Ensnaring Strike (ensnaring-strike), level 1. Sheet activity: save, damage. Matched by item. On your hit, Strength save or restrained.
- Entangle (entangle), level 1. Sheet activity: save. Matched by item. No note on the instruction.
- Faerie Fire (faerie-fire), level 1. Sheet activity: save. Matched by effect name. No note on the instruction.
- Fear (fear), level 3. Sheet activity: save. Matched by item. No note on the instruction.
- Feather Fall (feather-fall), level 1. Sheet activity: utility. Matched by item. No note on the instruction.
- Fire Shield (fire-shield), level 4. Sheet activity: utility. Matched by effect name. A melee hit against the warded creature deals 2d8 fire to the attacker. The cold shield uses the same damage.
- Flesh to Stone (flesh-to-stone), level 6. Sheet activity: save. Matched by item. Constitution save or restrained. The restrained creature repeats the save at the start of each of its turns.
- Forcecage (forcecage), level 7. Sheet activity: utility. Matched by item. A closed circle centered on you. Creatures cannot enter or leave it, including you. It is not a cage of bars.
- Globe of Invulnerability (globe-of-invulnerability), level 6. Sheet activity: utility. Matched by item. A 10-foot circle that follows you. A spell of level 5 or lower does not affect a creature inside it. The slot is still spent.
- Grease (grease), level 1. Sheet activity: save. Matched by item. No note on the instruction.
- Guiding Bolt (guiding-bolt), level 1. Sheet activity: attack. Matched by effect name. No note on the instruction.
- Haste (haste), level 3. Sheet activity: utility. Matched by item. On cast, +2 AC. While an effect named Haste remains, each turn starts with one extra action. The spell does not end with a lethargy turn, and it does not limit the extra action to one attack.
- Hellish Rebuke (hellish-rebuke), level 1. Sheet activity: save. Matched by item. No note on the instruction.
- Hex (hex), level 1. Sheet activity: damage, utility. Matched by item. No note on the instruction.
- Hideous Laughter (hideous-laughter), level 1. Sheet activity: save. Matched by item. No note on the instruction.
- Hold Monster (hold-monster), level 5. Sheet activity: save. Matched by item. No note on the instruction.
- Hold Person (hold-person), level 2. Sheet activity: save. Matched by item. No note on the instruction.
- Hunter's Mark (hunters-mark), level 1. Sheet activity: damage, utility. Matched by item. No note on the instruction.
- Insect Plague (insect-plague), level 5. Sheet activity: save. Matched by item. No note on the instruction.
- Misty Step (misty-step), level 2. Sheet activity: teleport. Matched by item. You move to 5 feet from the selected creature when that space is within 30 feet. No selected creature means you do not move.
- Moonbeam (moonbeam), level 2. Sheet activity: save. Matched by item. No note on the instruction.
- Power Word Kill (power-word-kill), level 9. Sheet activity: damage. Matched by item. If the target has 100 hit points or fewer, it takes damage equal to its current hit points.
- Power Word Stun (power-word-stun), level 8. Sheet activity: utility. Matched by item. If the target has 150 hit points or fewer, it is stunned. No save.
- Protection from Evil and Good (protection-from-evil-and-good), level 1. Sheet activity: utility. Matched by effect name. No note on the instruction.
- Sanctuary (sanctuary), level 1. Sheet activity: utility, save. Matched by effect name. No note on the instruction.
- Shield (shield), level 1. Sheet activity: utility. Matched by item. No note on the instruction.
- Sleet Storm (sleet-storm), level 3. Sheet activity: save. Matched by item. No note on the instruction.
- Slow (slow), level 3. Sheet activity: save. Matched by item. Wisdom save. A failure applies an effect named Slow that sets walk speed to half by an override of the current value is not possible, so the effect records the name and the turn denies the reaction.
- Spike Growth (spike-growth), level 2. Sheet activity: damage. Matched by item. No note on the instruction.
- Spirit Guardians (spirit-guardians), level 3. Sheet activity: save. Matched by item. No note on the instruction.
- Stinking Cloud (stinking-cloud), level 3. Sheet activity: save, utility. Matched by item. No note on the instruction.
- Suggestion (suggestion), level 2. Sheet activity: save. Matched by item. Damage ends an effect named Suggestion.
- Wall of Fire (wall-of-fire), level 4. Sheet activity: save, damage. Matched by item. No note on the instruction.
- Wall of Force (wall-of-force), level 5. Sheet activity: utility. Matched by item. A closed circle centered on you. Creatures cannot enter or leave it, including you. It is not a wall line.
- Wall of Stone (wall-of-stone), level 5. Sheet activity: utility. Matched by item. A closed circle centered on you. Creatures cannot enter or leave it, including you. It is not a wall line.
- Web (web), level 2. Sheet activity: save. Matched by item. No note on the instruction.

## Spells the sheet resolves

152 spells. The activity deals damage, heals, or applies an effect that changes a number or sets a status.

**Level -1** (1): Magical Berries (magical-berries)

**Cantrip** (17): Acid Splash (acid-splash), Chill Touch (chill-touch), Eldritch Blast (eldritch-blast), Fire Bolt (fire-bolt), Guidance (guidance), Poison Spray (poison-spray), Produce Flame (produce-flame), Ray of Frost (ray-of-frost), Sacred Flame (sacred-flame), Shillelagh (shillelagh), Shocking Grasp (shocking-grasp), Sorcerous Burst (sorcerous-burst), Spare the Dying (spare-the-dying), Starry Wisp (starry-wisp), Thaumaturgy (thaumaturgy), True Strike (true-strike), Vicious Mockery (vicious-mockery)

**Level 1** (24): Animal Friendship (animal-friendship), Bane (bane), Bless (bless), Burning Hands (burning-hands), Chromatic Orb (chromatic-orb), Color Spray (color-spray), Comprehend Languages (comprehend-languages), Cure Wounds (cure-wounds), Dissonant Whispers (dissonant-whispers), Divine Favor (divine-favor), False Life (false-life), Healing Word (healing-word), Heroism (heroism), Ice Knife (ice-knife), Inflict Wounds (inflict-wounds), Longstrider (longstrider), Mage Armor (mage-armor), Magic Missile (magic-missile), Ray of Sickness (ray-of-sickness), Searing Smite (searing-smite), Shield of Faith (shield-of-faith), Sleep (sleep), Speak with Animals (speak-with-animals), Thunderwave (thunderwave)

**Level 2** (27): Acid Arrow (acid-arrow), Aid (aid), Alter Self (alter-self), Arcane Vigor (arcane-vigor), Barkskin (barkskin), Darkvision (darkvision), Dragon's Breath (dragons-breath), Enhance Ability (enhance-ability), Enlarge/Reduce (enlarge-reduce), Enthrall (enthrall), Flame Blade (flame-blade), Heat Metal (heat-metal), Invisibility (invisibility), Magic Weapon (magic-weapon), Mind Spike (mind-spike), Mirror Image (mirror-image), Pass without Trace (pass-without-trace), Phantasmal Force (phantasmal-force), Prayer of Healing (prayer-of-healing), Protection from Poison (protection-from-poison), Ray of Enfeeblement (ray-of-enfeeblement), Scorching Ray (scorching-ray), See Invisibility (see-invisibility), Shatter (shatter), Shining Smite (shining-smite), Spider Climb (spider-climb), Warding Bond (warding-bond)

**Level 3** (16): Beacon of Hope (beacon-of-hope), Blink (blink), Call Lightning (call-lightning), Fireball (fireball), Fly (fly), Gaseous Form (gaseous-form), Glyph of Warding (glyph-of-warding), Hypnotic Pattern (hypnotic-pattern), Lightning Bolt (lightning-bolt), Mass Healing Word (mass-healing-word), Meld into Stone (meld-into-stone), Protection from Energy (protection-from-energy), Revivify (revivify), Tongues (tongues), Vampiric Touch (vampiric-touch), Wind Wall (wind-wall)

**Level 4** (12): Banishment (banishment), Black Tentacles (black-tentacles), Blight (blight), Conjure Minor Elementals (conjure-minor-elementals), Conjure Woodland Beings (conjure-woodland-beings), Control Water (control-water), Freedom of Movement (freedom-of-movement), Greater Invisibility (greater-invisibility), Ice Storm (ice-storm), Phantasmal Killer (phantasmal-killer), Stoneskin (stoneskin), Vitriolic Sphere (vitriolic-sphere)

**Level 5** (9): Cone of Cold (cone-of-cold), Contact Other Plane (contact-other-plane), Dream (dream), Flame Strike (flame-strike), Geas (geas), Mass Cure Wounds (mass-cure-wounds), Modify Memory (modify-memory), Raise Dead (raise-dead), Telepathic Bond (telepathic-bond)

**Level 6** (18): Chain Lightning (chain-lightning), Circle of Death (circle-of-death), Contingency (contingency), Disintegrate (disintegrate), Eyebite (eyebite), Forbiddance (forbiddance), Freezing Sphere (freezing-sphere), Harm (harm), Heal (heal), Heroes' Feast (heroes-feast), Irresistible Dance (ottos-irresistible-dance), Magic Jar (magic-jar), Mass Suggestion (mass-suggestion), Sunbeam (sunbeam), True Seeing (true-seeing), Wall of Ice (wall-of-ice), Wall of Thorns (wall-of-thorns), Wind Walk (wind-walk)

**Level 7** (10): Conjure Celestial (conjure-celestial), Delayed Blast Fireball (delayed-blast-fireball), Divine Word (divine-word), Etherealness (etherealness), Fire Storm (fire-storm), Prismatic Spray (prismatic-spray), Regenerate (regenerate), Resurrection (resurrection), Sequester (sequester), Symbol (symbol)

**Level 8** (8): Antipathy/Sympathy (antipathy-sympathy), Befuddlement (befuddlement), Earthquake (earthquake), Holy Aura (holy-aura), Incendiary Cloud (incendiary-cloud), Mind Blank (mind-blank), Sunburst (sunburst), Tsunami (tsunami)

**Level 9** (10): Astral Projection (astral-projection), Foresight (foresight), Imprisonment (imprisonment), Mass Heal (mass-heal), Meteor Swarm (meteor-swarm), Power Word Heal (power-word-heal), Prismatic Wall (prismatic-wall), Storm of Vengeance (storm-of-vengeance), Weird (weird), Wish (wish)

## Spells with a sheet summon activity

34 spells. The activity type on the item is summon. dnd5e places the profile on that activity. This module does not add a summon instruction. Light, Dancing Lights, Continual Flame, Minor Illusion, Silent Image, Major Image, Programmed Illusion, Clairvoyance, Arcane Eye, Scrying, Secret Chest, and Floating Disk are in this list because that activity type is summon.

- Animate Dead (animate-dead), level 3. Activities: summon.
- Animate Objects (animate-objects), level 5. Activities: summon.
- Arcane Eye (arcane-eye), level 4. Activities: summon.
- Arcane Hand (arcane-hand), level 5. Activities: summon.
- Arcane Sword (arcane-sword), level 7. Activities: summon.
- Clairvoyance (clairvoyance), level 3. Activities: summon.
- Conjure Animals (conjure-animals), level 3. Activities: summon, save.
- Conjure Elemental (conjure-elemental), level 5. Activities: summon.
- Conjure Fey (conjure-fey), level 6. Activities: summon, utility.
- Continual Flame (continual-flame), level 2. Activities: summon.
- Create Undead (create-undead), level 6. Activities: summon, utility.
- Dancing Lights (dancing-lights), level 0, Cantrips. Activities: summon, utility.
- Faithful Hound (faithful-hound), level 4. Activities: summon, utility.
- Find Familiar (find-familiar), level 1. Activities: summon.
- Find Steed (find-steed), level 2. Activities: summon.
- Finger of Death (finger-of-death), level 7. Activities: save, summon.
- Flaming Sphere (flaming-sphere), level 2. Activities: summon, save.
- Floating Disk (tensers-floating-disk), level 1. Activities: summon.
- Giant Insect (giant-insect), level 4. Activities: summon.
- Guardian of Faith (guardian-of-faith), level 4. Activities: summon, save.
- Light (light), level 0, Cantrips. Activities: summon.
- Mage Hand (mage-hand), level 0, Cantrips. Activities: summon.
- Major Image (major-image), level 3. Activities: summon.
- Minor Illusion (minor-illusion), level 0, Cantrips. Activities: summon.
- Mislead (mislead), level 5. Activities: summon. Statuses on the effect: invisible.
- Phantom Steed (phantom-steed), level 3. Activities: summon.
- Programmed Illusion (programmed-illusion), level 6. Activities: summon.
- Project Image (project-image), level 7. Activities: summon.
- Scrying (scrying), level 5. Activities: save, summon.
- Secret Chest (secret-chest), level 4. Activities: summon, utility.
- Silent Image (silent-image), level 1. Activities: summon.
- Spiritual Weapon (spiritual-weapon), level 2. Activities: summon.
- Summon Dragon (summon-dragon), level 5. Activities: summon.
- Unseen Servant (unseen-servant), level 1. Activities: summon.

## Spells with a sheet teleport button

7 spells. Misty Step is not in this list: it has an instruction, and that instruction moves you to 5 feet from the selected creature when that space is within 30 feet.

- Dimension Door (dimension-door), level 4. Activities: damage, teleport.
- Plane Shift (plane-shift), level 7. Activities: teleport.
- Teleport (teleport), level 7. Activities: teleport.
- Teleportation Circle (teleportation-circle), level 5. Activities: teleport.
- Transport via Plants (transport-via-plants), level 6. Activities: teleport.
- Tree Stride (tree-stride), level 5. Activities: teleport.
- Word of Recall (word-of-recall), level 6. Activities: teleport, utility.

## Spells that roll and then stop

14 spells. The card asks for the roll. The activity stores no damage and no effect.

- Animal Messenger (animal-messenger), level 2. Activities: save.
- Detect Thoughts (detect-thoughts), level 2. Activities: save, utility.
- Gust of Wind (gust-of-wind), level 2. Activities: save.
- Levitate (levitate), level 2. Activities: save.
- Magic Circle (magic-circle), level 3. Activities: save.
- Maze (maze), level 8. Activities: check.
- Planar Binding (planar-binding), level 5. Activities: save.
- Polymorph (polymorph), level 4. Activities: save.
- Resilient Sphere (resilient-sphere), level 4. Activities: save.
- Reverse Gravity (reverse-gravity), level 7. Activities: save.
- Seeming (seeming), level 5. Activities: save, utility.
- Telekinesis (telekinesis), level 5. Activities: save.
- True Polymorph (true-polymorph), level 9. Activities: save.
- Zone of Truth (zone-of-truth), level 2. Activities: save.

## Spells with no activity and no instruction

76 spells.

- Alarm (alarm), level 1. Activities: utility.
- Animal Shapes (animal-shapes), level 8. Activities: utility.
- Arcane Lock (arcane-lock), level 2. Activities: utility.
- Arcanist's Magic Aura (arcanists-magic-aura), level 2. Activities: utility.
- Augury (augury), level 2. Activities: utility.
- Awaken (awaken), level 5. Activities: utility.
- Clone (clone), level 8. Activities: utility.
- Commune (commune), level 5. Activities: utility.
- Commune with Nature (commune-with-nature), level 5. Activities: utility.
- Control Weather (control-weather), level 8. Activities: utility.
- Create Food and Water (create-food-and-water), level 3. Activities: utility.
- Create or Destroy Water (create-or-destroy-water), level 1. Activities: utility.
- Creation (creation), level 5. Activities: utility.
- Darkness (darkness), level 2. Activities: utility.
- Daylight (daylight), level 3. Activities: utility.
- Demiplane (demiplane), level 8. Activities: utility.
- Detect Evil and Good (detect-evil-and-good), level 1. Activities: utility.
- Detect Magic (detect-magic), level 1. Activities: utility.
- Detect Poison and Disease (detect-poison-and-disease), level 1. Activities: utility.
- Disguise Self (disguise-self), level 1. Activities: utility.
- Dispel Magic (dispel-magic), level 3. Activities: utility.
- Divination (divination), level 4. Activities: utility.
- Druidcraft (druidcraft), level 0, Cantrips. Activities: utility.
- Elementalism (elementalism), level 0, Cantrips. Activities: utility.
- Expeditious Retreat (expeditious-retreat), level 1. Activities: utility.
- Fabricate (fabricate), level 4. Activities: utility.
- Find the Path (find-the-path), level 6. Activities: utility.
- Find Traps (find-traps), level 2. Activities: utility.
- Fog Cloud (fog-cloud), level 1. Activities: utility.
- Gate (gate), level 9. Activities: utility.
- Gentle Repose (gentle-repose), level 2. Activities: utility.
- Glibness (glibness), level 8. Activities: utility.
- Goodberry (goodberry), level 1. Activities: utility.
- Greater Restoration (greater-restoration), level 5. Activities: utility.
- Guards and Wards (guards-and-wards), level 6. Activities: utility.
- Hallow (hallow), level 5. Activities: utility.
- Hallucinatory Terrain (hallucinatory-terrain), level 4. Activities: utility.
- Identify (identify), level 1. Activities: utility.
- Illusory Script (illusory-script), level 1. Activities: utility.
- Instant Summons (instant-summons), level 6. Activities: utility.
- Jump (jump), level 1. Activities: utility.
- Knock (knock), level 2. Activities: utility.
- Legend Lore (legend-lore), level 5. Activities: utility.
- Lesser Restoration (lesser-restoration), level 2. Activities: utility.
- Locate Animals or Plants (locate-animals-or-plants), level 2. Activities: utility.
- Locate Creature (locate-creature), level 4. Activities: utility.
- Locate Object (locate-object), level 2. Activities: utility.
- Magic Mouth (magic-mouth), level 2. Activities: utility.
- Magnificent Mansion (magnificent-mansion), level 7. Activities: utility.
- Mending (mending), level 0, Cantrips. Activities: utility.
- Message (message), level 0, Cantrips. Activities: utility.
- Mirage Arcane (mirage-arcane), level 7. Activities: utility.
- Move Earth (move-earth), level 6. Activities: utility.
- Nondetection (nondetection), level 3. Activities: utility.
- Passwall (passwall), level 5. Activities: utility.
- Planar Ally (planar-ally), level 6. Activities: utility.
- Plant Growth (plant-growth), level 3. Activities: utility.
- Prestidigitation (prestidigitation), level 0, Cantrips. Activities: utility.
- Private Sanctum (private-sanctum), level 4. Activities: utility.
- Purify Food and Drink (purify-food-and-drink), level 1. Activities: utility.
- Reincarnate (reincarnate), level 5. Activities: utility.
- Remove Curse (remove-curse), level 3. Activities: utility.
- Resistance (resistance), level 0, Cantrips. Activities: utility.
- Rope Trick (rope-trick), level 2. Activities: utility.
- Sending (sending), level 3. Activities: utility.
- Shapechange (shapechange), level 9. Activities: utility.
- Silence (silence), level 2. Activities: utility.
- Simulacrum (simulacrum), level 7. Activities: utility.
- Speak with Dead (speak-with-dead), level 3. Activities: utility.
- Speak with Plants (speak-with-plants), level 3. Activities: utility.
- Stone Shape (stone-shape), level 4. Activities: utility.
- Time Stop (time-stop), level 9. Activities: utility.
- Tiny Hut (tiny-hut), level 3. Activities: utility.
- True Resurrection (true-resurrection), level 9. Activities: utility.
- Water Breathing (water-breathing), level 3. Activities: utility.
- Water Walk (water-walk), level 3. Activities: utility.

## Plane, door, and wall shape

These are the spells whose printed behavior is not a save, a damage roll, or a filled circle.

2 spells set the ethereal status and leave the token on this scene: Blink (blink), Etherealness (etherealness).

2 spells do not change a door: Arcane Lock (arcane-lock), Knock (knock).

Wall of Force, Wall of Stone, and Forcecage have instructions. Each instruction is a closed circle centered on the caster. Wall of Force and Wall of Stone are 10 feet. Forcecage is 20 feet. They are not a wall line and not a cage of bars.

## Class and subclass records

24 records. These are the class and subclass items. Features granted by them are listed with the feats.

- Barbarian (barbarian), class
- Bard (bard), class
- Champion (champion), subclass
- Circle of the Land (land), subclass
- Cleric (cleric), class
- College of Lore (lore), subclass
- Draconic Sorcery (draconic), subclass
- Druid (druid), class
- Evoker (evoker), subclass
- Fiend Patron (fiend), subclass
- Fighter (fighter), class
- Hunter (hunter), subclass
- Life Domain (life), subclass
- Monk (monk), class
- Oath of Devotion (devotion), subclass
- Paladin (paladin), class
- Path of the Berserker (berserker), subclass
- Ranger (ranger), class
- Rogue (rogue), class
- Sorcerer (sorcerer), class
- Thief (thief), subclass
- Warlock (warlock), class
- Warrior of the Open Hand (hand), subclass
- Wizard (wizard), class

## Feats and class features with an instruction

49 items.

- Action Surge (action-surge), feat, Class Features. Sheet activity: utility. Matched by item. No note on the instruction.
- Agonizing Blast (agonizing-blast), feat, Eldritch Invocation Options. Sheet activity: no activity. Matched by item. Eldritch Blast deals extra damage equal to your Charisma modifier. Other attacks do not.
- Alert (alert), feat, Origin Feats. Sheet activity: no activity. Matched by item. Gaining the surprised condition removes it. After you roll initiative, a dialog can swap your total with an ally in the combat.
- Aura of Courage (aura-of-courage), feat, Class Features. Sheet activity: utility. Matched by item. No note on the instruction.
- Aura of Devotion (aura-of-devotion), feat, Oath of Devotion. Sheet activity: no activity. Matched by item. No note on the instruction.
- Aura of Protection (aura-of-protection), feat, Class Features. Sheet activity: utility. Matched by item. No note on the instruction.
- Bardic Inspiration (bardic-inspiration), feat, Class Features. Sheet activity: utility. Matched by item. The ally's next attack roll, check, or save adds your Bardic Inspiration die.
- Boon of Combat Prowess (boon-of-combat-prowess), feat, Epic Boon Feats. Sheet activity: no activity. Matched by item. When you miss, you may turn that miss into a hit. Once per round.
- Boon of Fate (boon-of-fate), feat, Epic Boon Feats. Sheet activity: utility. Matched by item. When you declare an attack, you may add 2d4 to the attack roll. Subtracting 2d4, and changing a save, are not implemented.
- Boon of Irresistible Offense (boon-of-irresistible-offense), feat, Epic Boon Feats. Sheet activity: no activity. Matched by item. Your weapon attacks ignore resistance to bludgeoning, piercing, and slashing. The extra critical die is not added.
- Boon of Spell Recall (boon-of-spell-recall), feat, Epic Boon Feats. Sheet activity: utility. Matched by item. Using it restores the highest expended spell slot of level 4 or lower. It does not roll the d6 from the boon.
- Boon of the Night Spirit (boon-of-the-night-spirit), feat, Epic Boon Feats. Sheet activity: utility. Matched by item. At the start of your turn you are invisible while the light at your token is dim or dark, and visible again in bright light. No recorded scene lights means no change.
- Brutal Strike (brutal-strike), feat, Class Features. Sheet activity: damage. Matched by item. No note on the instruction.
- Careful Spell (careful-spell), feat, Metamagic Options. Sheet activity: utility. Matched by item. No note on the instruction.
- Countercharm (countercharm), feat, Class Features. Sheet activity: utility. Matched by item. No note on the instruction.
- Cunning Strike (cunning-strike), feat, Class Features. Sheet activity: save, damage, utility. Matched by item. On your hit, Dexterity save or prone. A sneak-attack die is not removed. On your hit, Constitution save or poisoned. A sneak-attack die is not removed.
- Cutting Words (cutting-words), feat, Lore. Sheet activity: utility. Matched by item. No note on the instruction.
- Dark One's Blessing (dark-ones-blessing), feat, Fiend Patron. Sheet activity: heal. Matched by item. No note on the instruction.
- Defense (defense), feat, Fighting Style Feats. Sheet activity: no activity. Matched by item. No note on the instruction.
- Deflect Attacks (deflect-attacks), feat, Class Features. Sheet activity: heal, save. Matched by item. No note on the instruction.
- Deflect Energy (deflect-energy), feat, Class Features. Sheet activity: heal, save. Matched by item. No note on the instruction.
- Devil's Sight (devils-sight), feat, Eldritch Invocation Options. Sheet activity: no activity. Matched by item. Once, darkvision increases by 120 feet.
- Distant Spell (distant-spell), feat, Metamagic Options. Sheet activity: utility. Matched by item. No note on the instruction.
- Eldritch Smite (eldritch-smite), feat, Eldritch Invocation Options. Sheet activity: damage. Matched by item. No note on the instruction.
- Empowered Spell (empowered-spell), feat, Metamagic Options. Sheet activity: utility. Matched by item. No note on the instruction.
- Extended Spell (extended-spell), feat, Metamagic Options. Sheet activity: utility. Matched by item. No note on the instruction.
- Grappler (grappler), feat, General Feats. Sheet activity: no activity. Matched by item. No note on the instruction.
- Heightened Spell (heightened-spell), feat, Metamagic Options. Sheet activity: utility. Matched by item. No note on the instruction.
- Indomitable (indomitable), feat, Class Features. Sheet activity: utility. Matched by item. No note on the instruction.
- Instinctive Pounce (instinctive-pounce), feat, Class Features. Sheet activity: no activity. Matched by item. Using it lets you move 15 feet without spending speed or provoking. It is not half your speed.
- Open Hand Technique (open-hand-technique), feat, Warrior of the Open Hand. Sheet activity: utility, save. Matched by item. No note on the instruction.
- Quickened Spell (quickened-spell), feat, Metamagic Options. Sheet activity: utility. Matched by item. No note on the instruction.
- Relentless Rage (relentless-rage), feat, Class Features. Sheet activity: save, heal. Matched by item. When you are damaged to 0 hit points, Constitution save. The DC starts at 10 and increases by 5 after each success.
- Remarkable Athlete (remarkable-athlete), feat, Champion. Sheet activity: no activity. Matched by item. Initiative rolls through dnd5e.preRollInitiative are marked advantage. Athletics checks through dnd5e.preRollSkill gain half your proficiency, rounded down. Jump distance is not increased.
- Repelling Blast (repelling-blast), feat, Eldritch Invocation Options. Sheet activity: enchant. Matched by item. When you hit with Eldritch Blast, push the target 10 feet.
- Retaliation (retaliation), feat, Path of the Berserker. Sheet activity: utility. Matched by item. No note on the instruction.
- Slow Fall (slow-fall), feat, Class Features. Sheet activity: heal. Matched by item. No note on the instruction.
- Sneak Attack (sneak-attack), feat, Class Features. Sheet activity: damage. Matched by item. No note on the instruction.
- Steady Aim (steady-aim), feat, Class Features. Sheet activity: utility. Matched by item. No note on the instruction.
- Stone's Endurance (stones-endurance), feat, Goliath. Sheet activity: heal. Matched by item. No note on the instruction.
- Storm's Thunder (storms-thunder), feat, Goliath. Sheet activity: damage. Matched by item. No note on the instruction.
- Studied Attacks (studied-attacks), feat, Class Features. Sheet activity: no activity. Matched by item. When you miss, your next attack roll has advantage.
- Stunning Strike (stunning-strike), feat, Class Features. Sheet activity: save. Matched by item. No note on the instruction.
- Subtle Spell (subtle-spell), feat, Metamagic Options. Sheet activity: utility. Matched by item. No note on the instruction.
- Superior Hunter's Defense (superior-hunters-defense), feat, Hunter. Sheet activity: utility. Matched by item. No note on the instruction.
- Tactical Mind (tactical-mind), feat, Class Features. Sheet activity: utility. Matched by item. Using it stores 1d10 on your next ability check, attack, or save. It does not change a check you already failed.
- Tactical Shift (tactical-shift), feat, Class Features. Sheet activity: no activity. Matched by item. An ally may move 15 feet without spending speed or provoking. It is not half their speed.
- Twinned Spell (twinned-spell), feat, Metamagic Options. Sheet activity: utility. Matched by item. No note on the instruction.
- Uncanny Dodge (uncanny-dodge), feat, Class Features. Sheet activity: utility. Matched by item. No note on the instruction.

## Feats and class features the sheet resolves

94 items with damage, healing, a transform activity, or an effect that changes a number or sets a status. 5 have a summon activity. 0 have a teleport button.

- Abjure Foes (abjure-foes), feat, Class Features. Activities: save. Statuses on the effect: frightened.
- Adrenaline Rush (adrenaline-rush), feat, Orc. Activities: heal.
- Archery (archery), feat, Fighting Style Feats. Activities: no activity.
- Armor of Shadows (armor-of-shadows), feat, Eldritch Invocation Options. Activities: utility.
- Blessed Healer (blessed-healer), feat, Life Domain. Activities: heal.
- Blessed Strikes: Divine Strike (blessed-strikes-divine-strike), feat, Class Features. Activities: damage.
- Blessed Strikes: Potent Spellcasting (blessed-strikes-potent-spellcasting), feat, Class Features. Activities: damage.
- Boon of Truesight (boon-of-truesight), feat, Epic Boon Feats. Activities: no activity.
- Breath Weapon (breath-weapon), feat, Dragonborn. Activities: save.
- Channel Divinity (channel-divinity-cleric), feat, Class Features. Activities: heal, save. Statuses on the effect: frightened, incapacitated.
- Cunning Action (cunning-action), feat, Class Features. Activities: utility. Statuses on the effect: hiding.
- Danger Sense (danger-sense), feat, Class Features. Activities: no activity.
- Devious Strikes (devious-strikes), feat, Class Features. Activities: save. Statuses on the effect: unconscious, blinded.
- Disciple of Life (disciple-of-life), feat, Life Domain. Activities: heal.
- Disciplined Survivor (disciplined-survivor), feat, Class Features. Activities: utility.
- Divine Order: Protector (divine-order-protector), feat, Class Features. Activities: no activity.
- Divine Order: Thaumaturge (divine-order-thaumaturge), feat, Class Features. Activities: no activity.
- Draconic Resilience (draconic-resilience), feat, Draconic Sorcery. Activities: no activity.
- Dragon Wings (dragon-wings), feat, Draconic Sorcery. Activities: utility.
- Dwarven Toughness (dwarven-toughness), feat, Dwarf. Activities: no activity.
- Eldritch Mind (eldritch-mind), feat, Eldritch Invocation Options. Activities: no activity.
- Eldritch Spear (eldritch-spear), feat, Eldritch Invocation Options. Activities: enchant.
- Elemental Affinity (elemental-affinity), feat, Draconic Sorcery. Activities: damage.
- Elemental Fury: Primal Strike (elemental-fury-primal-strike), feat, Class Features. Activities: damage.
- Empowered Evocation (empowered-evocation), feat, Evoker. Activities: damage.
- Empowered Strikes (empowered-strikes), feat, Class Features. Activities: attack.
- Fast Movement (fast-movement), feat, Class Features. Activities: no activity.
- Feral Instinct (feral-instinct), feat, Class Features. Activities: no activity.
- Feral Senses (feral-senses), feat, Class Features. Activities: no activity.
- Fiendish Resilience (fiendish-resilience), feat, Fiend Patron. Activities: no activity.
- Fiendish Vigor (fiendish-vigor), feat, Eldritch Invocation Options. Activities: heal.
- Fire's Burn (fires-burn), feat, Goliath. Activities: damage.
- Foe Slayer (foe-slayer), feat, Class Features. Activities: damage.
- Frenzy (frenzy), feat, Path of the Berserker. Activities: damage.
- Frost's Chill (frosts-chill), feat, Goliath. Activities: damage.
- Gnomish Cunning (gnomish-cunning), feat, Gnome. Activities: no activity.
- Halfling Nimbleness (halfling-nimbleness), feat, Halfling. Activities: no activity.
- Heightened Focus (heightened-focus), feat, Class Features. Activities: utility, heal.
- Holy Nimbus (holy-nimbus), feat, Oath of Devotion. Activities: damage, utility.
- Hunter's Prey (hunters-prey), feat, Hunter. Activities: damage.
- Hurl Through Hell (hurl-through-hell), feat, Fiend Patron. Activities: save, utility.
- Improved Blessed Strikes (improved-blessed-strikes), feat, Class Features. Activities: heal.
- Improved Critical (improved-critical), feat, Champion. Activities: no activity.
- Innate Sorcery (innate-sorcery), feat, Class Features. Activities: utility.
- Intimidating Presence (intimidating-presence), feat, Path of the Berserker. Activities: save, utility. Statuses on the effect: frightened.
- Investment of the Chain Master (investment-of-the-chain-master), feat, Eldritch Invocation Options. Activities: summon, utility.
- Jack of All Trades (jack-of-all-trades), feat, Class Features. Activities: no activity.
- Land's Aid (lands-aid), feat, Circle of Land. Activities: save, heal.
- Large Form (large-form), feat, Goliath. Activities: utility.
- Lay on Hands (lay-on-hands), feat, Class Features. Activities: heal, utility.
- Lifedrinker (lifedrinker), feat, Eldritch Invocation Options. Activities: damage, heal.
- Luck (luck), feat, Halfling. Activities: no activity.
- Martial Arts (martial-arts), feat, Class Features. Activities: enchant.
- Master of Myriad Forms (master-of-myriad-forms), feat, Eldritch Invocation Options. Activities: utility, attack.
- Mindless Rage (mindless-rage), feat, Path of the Berserker. Activities: no activity.
- Misty Visions (misty-visions), feat, Eldritch Invocation Options. Activities: summon.
- Monk's Focus (monks-focus), feat, Class Features. Activities: utility. Statuses on the effect: dodging.
- Nature's Sanctuary (natures-sanctuary), feat, Circle of Land. Activities: utility. Statuses on the effect: coverHalf.
- Nature's Veil (natures-veil), feat, Class Features. Activities: utility. Statuses on the effect: invisible.
- Nature's Ward (natures-ward), feat, Circle of Land. Activities: no activity.
- One with Shadows (one-with-shadows), feat, Eldritch Invocation Options. Activities: utility. Statuses on the effect: invisible.
- Overchannel (overchannel), feat, Evoker. Activities: damage.
- Pact of the Blade (pact-of-the-blade), feat, Eldritch Invocation Options. Activities: enchant, attack.
- Pact of the Chain (pact-of-the-chain), feat, Eldritch Invocation Options. Activities: summon.
- Powerful Build (powerful-build), feat, Goliath. Activities: no activity.
- Preserve Life (preserve-life), feat, Life Domain. Activities: heal.
- Primal Knowledge (primal-knowledge), feat, Class Features. Activities: no activity.
- Primal Order: Magician (primal-order-magician), feat, Class Features. Activities: no activity.
- Primal Order: Warden (primal-order-warden), feat, Class Features. Activities: no activity.
- Quivering Palm (quivering-palm), feat, Warrior of the Open Hand. Activities: save, utility.
- Radiant Strikes (radiant-strikes), feat, Class Features. Activities: no activity.
- Rage (rage), feat, Class Features. Activities: utility.
- Relentless Endurance (relentless-endurance), feat, Orc. Activities: heal.
- Reliable Talent (reliable-talent), feat, Class Features. Activities: no activity.
- Roving (roving), feat, Class Features. Activities: no activity.
- Sacred Weapon (sacred-weapon), feat, Oath of Devotion. Activities: enchant.
- Sear Undead (sear-undead), feat, Class Features. Activities: save. Statuses on the effect: frightened, incapacitated.
- Second Wind (second-wind), feat, Class Features. Activities: heal.
- Second-Story Work (second-story-work), feat, Thief. Activities: no activity.
- Signature Spells (signature-spells), feat, Class Features. Activities: enchant, utility.
- Smite of Protection (smite-of-protection), feat, Oath of Devotion. Activities: no activity. Statuses on the effect: coverHalf.
- Spell Mastery (spell-mastery), feat, Class Features. Activities: enchant.
- Stonecunning (stonecunning), feat, Dwarf. Activities: utility.
- Superior Critical (superior-critical), feat, Champion. Activities: no activity.
- Superior Defense (superior-defense), feat, Class Features. Activities: utility.
- Superior Hunter's Prey (superior-hunters-prey), feat, Hunter. Activities: damage.
- Survivor (survivor), feat, Champion. Activities: heal.
- Tactical Master (tactical-master), feat, Class Features. Activities: no activity.
- Tireless (tireless), feat, Class Features. Activities: heal, utility.
- Unarmored Defense (unarmored-defense), feat, Class Features. Activities: no activity.
- Unarmored Defense (unarmored-defense), feat, Class Features. Activities: no activity.
- Unarmored Movement (unarmored-movement), feat, Class Features. Activities: no activity.
- Uncanny Metabolism (uncanny-metabolism), feat, Class Features. Activities: heal.
- Use Magic Device (use-magic-device), feat, Thief. Activities: no activity.
- Visions of Distant Realms (visions-of-distant-realms), feat, Eldritch Invocation Options. Activities: summon.
- Wholeness of Body (wholeness-of-body), feat, Warrior of the Open Hand. Activities: heal.
- Wild Companion (wild-companion), feat, Class Features. Activities: summon.
- Wild Shape (wild-shape), feat, Class Features. Activities: transform.
- Witch Sight (witch-sight), feat, Eldritch Invocation Options. Activities: no activity.

## Feats and class features that roll and then stop

1 items.

- Fast Hands (fast-hands), feat, Thief. Activities: check, utility.

## Feats and class features with no activity and no instruction

159 items. Spellcasting, Extra Attack, Weapon Mastery, and Fighting Style are in this list when the pack item has no activity. The sheet stores those on the class.

- Ability Score Improvement (ability-score-improvement), feat, General Feats. Activities: no activity.
- Acrobatic Movement (acrobatic-movement), feat, Class Features. Activities: no activity.
- Additional Fighting Style (additional-fighting-style), feat, Champion. Activities: no activity.
- Arcane Apotheosis (arcane-apotheosis), feat, Class Features. Activities: no activity.
- Arcane Recovery (arcane-recovery), feat, Class Features. Activities: utility.
- Archdruid (archdruid), feat, Class Features. Activities: utility.
- Ascendant Step (ascendant-step), feat, Eldritch Invocation Options. Activities: utility.
- Aura Expansion (aura-expansion), feat, Class Features. Activities: no activity.
- Beast Spells (beast-spells), feat, Class Features. Activities: no activity.
- Blessed Strikes (blessed-strikes), feat, Class Features. Activities: no activity.
- Blessed Warrior (blessed-warrior), feat, Class Features. Activities: no activity.
- Body and Mind (body-and-mind), feat, Class Features. Activities: no activity.
- Bonus Proficiencies (bonus-proficiencies), feat, Lore. Activities: no activity.
- Boon of Dimensional Travel (boon-of-dimensional-travel), feat, Epic Boon Feats. Activities: utility.
- Brave (brave), feat, Halfling. Activities: no activity.
- Channel Divinity (channel-divinity-paladin), feat, Class Features. Activities: utility.
- Circle of the Land Spells (circle-of-the-land-spells), feat, Circle of Land. Activities: no activity.
- Cloud's Jaunt (clouds-jaunt), feat, Goliath. Activities: utility.
- Contact Patron (contact-patron), feat, Class Features. Activities: no activity.
- Dark One's Own Luck (dark-ones-own-luck), feat, Fiend Patron. Activities: utility.
- Defensive Tactics (defensive-tactics), feat, Hunter. Activities: utility.
- Deft Explorer (deft-explorer), feat, Class Features. Activities: no activity.
- Devouring Blade (devouring-blade), feat, Eldritch Invocation Options. Activities: no activity.
- Divine Intervention (divine-intervention), feat, Class Features. Activities: utility.
- Divine Order (divine-order), feat, Class Features. Activities: no activity.
- Draconic Flight (draconic-flight), feat, Dragonborn. Activities: utility.
- Draconic Spells (draconic-spells), feat, Draconic Sorcery. Activities: no activity.
- Dragon Companion (dragon-companion), feat, Draconic Sorcery. Activities: utility.
- Druidic (druidic), feat, Class Features. Activities: no activity.
- Druidic Warrior (druidic-warrior), feat, Class Features. Activities: no activity.
- Dwarven Resilience (dwarven-resilience), feat, Dwarf. Activities: no activity.
- Eldritch Invocations (eldritch-invocations), feat, Class Features. Activities: no activity.
- Eldritch Master (eldritch-master), feat, Class Features. Activities: utility.
- Elemental Fury (elemental-fury), feat, Class Features. Activities: no activity.
- Elemental Fury: Potent Spellcasting (elemental-fury-potent-spellcasting), feat, Class Features. Activities: no activity.
- Elusive (elusive), feat, Class Features. Activities: no activity.
- Elven Lineage, Drow (elven-lineage-drow), feat, Elf. Activities: no activity.
- Elven Lineage, High Elf (elven-lineage-high-elf), feat, Elf. Activities: no activity.
- Elven Lineage, Wood Elf (elven-lineage-wood-elf), feat, Elf. Activities: no activity.
- Epic Boon (epic-boon), feat, Class Features. Activities: no activity.
- Epic Boon (epic-boon), feat, Class Features. Activities: no activity.
- Epic Boon (epic-boon), feat, Class Features. Activities: no activity.
- Epic Boon (epic-boon), feat, Class Features. Activities: no activity.
- Epic Boon (epic-boon), feat, Class Features. Activities: no activity.
- Epic Boon (epic-boon), feat, Class Features. Activities: no activity.
- Epic Boon (epic-boon), feat, Class Features. Activities: no activity.
- Epic Boon (epic-boon), feat, Class Features. Activities: no activity.
- Epic Boon (epic-boon), feat, Class Features. Activities: no activity.
- Epic Boon (epic-boon), feat, Class Features. Activities: no activity.
- Epic Boon (epic-boon), feat, Class Features. Activities: no activity.
- Epic Boon (epic-boon), feat, Class Features. Activities: no activity.
- Evasion (evasion), feat, Class Features. Activities: no activity.
- Evasion (evasion), feat, Class Features. Activities: no activity.
- Evocation Savant (evocation-savant), feat, Evoker. Activities: no activity.
- Expertise (expertise), feat, Class Features. Activities: no activity.
- Expertise (expertise), feat, Class Features. Activities: no activity.
- Expertise (expertise), feat, Class Features. Activities: no activity.
- Extra Attack (extra-attack), feat, Class Features. Activities: no activity.
- Extra Attack (extra-attack), feat, Class Features. Activities: no activity.
- Extra Attack (extra-attack), feat, Class Features. Activities: no activity.
- Extra Attack (extra-attack), feat, Class Features. Activities: no activity.
- Extra Attack (extra-attack), feat, Class Features. Activities: no activity.
- Faithful Steed (faithful-steed), feat, Class Features. Activities: no activity.
- Favored Enemy (favored-enemy), feat, Class Features. Activities: cast.
- Fey Ancestry (fey-ancestry), feat, Elf. Activities: no activity.
- Fiend Spells (fiend-spells), feat, Fiend Patron. Activities: no activity.
- Fiendish Legacy, Abyssal (fiendish-legacy-abyssal), feat, Tiefling. Activities: no activity.
- Fiendish Legacy, Chthonic (fiendish-legacy-chthonic), feat, Tiefling. Activities: no activity.
- Fiendish Legacy, Infernal (fiendish-legacy-infernal), feat, Tiefling. Activities: no activity.
- Fighting Style (fighting-style), feat, Class Features. Activities: no activity.
- Fighting Style (fighting-style), feat, Class Features. Activities: no activity.
- Fighting Style (fighting-style), feat, Class Features. Activities: no activity.
- Fleet Step (fleet-step), feat, Warrior of the Open Hand. Activities: no activity.
- Font of Inspiration (font-of-inspiration), feat, Class Features. Activities: utility.
- Font of Magic (font-of-magic), feat, Class Features. Activities: utility.
- Gaze of Two Minds (gaze-of-two-minds), feat, Eldritch Invocation Options. Activities: utility.
- Giant Ancestry (giant-ancestry), feat, Goliath. Activities: no activity.
- Gift of the Depths (gift-of-the-depths), feat, Eldritch Invocation Options. Activities: utility.
- Gift of the Protectors (gift-of-the-protectors), feat, Eldritch Invocation Options. Activities: utility.
- Gnomish Lineage, Forest (gnomish-lineage-forest), feat, Gnome. Activities: no activity.
- Gnomish Lineage, Rock (gnomish-lineage-rock), feat, Gnome. Activities: no activity.
- Great Weapon Fighting (great-weapon-fighting), feat, Fighting Style Feats. Activities: no activity.
- Greater Divine Intervention (greater-divine-intervention), feat, Class Features. Activities: utility.
- Heroic Warrior (heroic-warrior), feat, Champion. Activities: no activity.
- Hill's Tumble (hills-tumble), feat, Goliath. Activities: utility.
- Hunter's Lore (hunters-lore), feat, Hunter. Activities: no activity.
- Improved Brutal Strike (improved-brutal-strike), feat, Class Features. Activities: utility.
- Improved Brutal Strike (2) (improved-brutal-strike-2), feat, Class Features. Activities: no activity.
- Improved Cunning Strike (improved-cunning-strike), feat, Class Features. Activities: no activity.
- Improved Elemental Fury (improved-elemental-fury), feat, Class Features. Activities: no activity.
- Indomitable Might (indomitable-might), feat, Class Features. Activities: no activity.
- Keen Senses (keen-senses), feat, Elf. Activities: no activity.
- Lessons of the First Ones (lessons-of-the-first-ones), feat, Eldritch Invocation Options. Activities: no activity.
- Life Domain Spells (life-domain-spells), feat, Life Domain. Activities: no activity.
- Magic Initiate (magic-initiate), feat, Origin Feats. Activities: no activity.
- Magical Cunning (magical-cunning), feat, Class Features. Activities: utility.
- Magical Discoveries (magical-discoveries), feat, Lore. Activities: no activity.
- Magical Secrets (magical-secrets), feat, Class Features. Activities: no activity.
- Mask of Many Faces (mask-of-many-faces), feat, Eldritch Invocation Options. Activities: utility.
- Memorize Spell (memorize-spell), feat, Class Features. Activities: no activity.
- Metamagic (metamagic), feat, Class Features. Activities: no activity.
- Mystic Arcanum (mystic-arcanum), feat, Class Features. Activities: no activity.
- Natural Recovery (natural-recovery), feat, Circle of Land. Activities: utility.
- Naturally Stealthy (naturally-stealthy), feat, Halfling. Activities: no activity.
- Oath of Devotion Spells (oath-of-devotion-spells), feat, Oath of Devotion. Activities: no activity.
- Otherworldly Leap (otherworldly-leap), feat, Eldritch Invocation Options. Activities: utility.
- Otherworldly Presence (otherworldly-presence), feat, Tiefling. Activities: no activity.
- Pact Magic (pact-magic), feat, Class Features. Activities: no activity.
- Pact of the Tome (pact-of-the-tome), feat, Eldritch Invocation Options. Activities: no activity.
- Paladin's Smite (paladins-smite), feat, Class Features. Activities: no activity.
- Peerless Skill (peerless-skill), feat, Lore. Activities: utility.
- Perfect Focus (perfect-focus), feat, Class Features. Activities: no activity.
- Persistent Rage (persistent-rage), feat, Class Features. Activities: utility.
- Potent Cantrip (potent-cantrip), feat, Evoker. Activities: no activity.
- Precise Hunter (precise-hunter), feat, Class Features. Activities: no activity.
- Primal Champion (primal-champion), feat, Class Features. Activities: no activity.
- Primal Order (primal-order), feat, Class Features. Activities: no activity.
- Reckless Attack (reckless-attack), feat, Class Features. Activities: no activity.
- Relentless Hunter (relentless-hunter), feat, Class Features. Activities: no activity.
- Resourceful (resourceful), feat, Human. Activities: no activity.
- Restoring Touch (restoring-touch), feat, Class Features. Activities: utility.
- Ritual Adept (ritual-adept), feat, Class Features. Activities: no activity.
- Savage Attacker (savage-attacker), feat, Origin Feats. Activities: no activity.
- Scholar (scholar), feat, Class Features. Activities: no activity.
- Sculpt Spells (sculpt-spells), feat, Evoker. Activities: no activity.
- Seeking Spell (seeking-spell), feat, Metamagic Options. Activities: utility.
- Skilled (skilled), feat, Origin Feats. Activities: no activity.
- Skillful (skillful), feat, Human. Activities: no activity.
- Slippery Mind (slippery-mind), feat, Class Features. Activities: no activity.
- Sorcerous Restoration (sorcerous-restoration), feat, Class Features. Activities: utility.
- Sorcery Incarnate (sorcery-incarnate), feat, Class Features. Activities: utility.
- Spellcasting (spellcasting), feat, Class Features. Activities: no activity.
- Spellcasting (spellcasting), feat, Class Features. Activities: no activity.
- Spellcasting (spellcasting), feat, Class Features. Activities: no activity.
- Spellcasting (spellcasting), feat, Class Features. Activities: no activity.
- Spellcasting (spellcasting), feat, Class Features. Activities: no activity.
- Spellcasting (spellcasting), feat, Class Features. Activities: no activity.
- Spellcasting (spellcasting), feat, Class Features. Activities: no activity.
- Stroke of Luck (stroke-of-luck), feat, Class Features. Activities: utility.
- Superior Inspiration (superior-inspiration), feat, Class Features. Activities: no activity.
- Supreme Healing (supreme-healing), feat, Life Domain. Activities: no activity.
- Supreme Sneak (supreme-sneak), feat, Thief. Activities: no activity.
- Thief's Reflexes (thiefs-reflexes), feat, Thief. Activities: no activity.
- Thieves' Cant (thieves-cant), feat, Class Features. Activities: no activity.
- Thirsting Blade (thirsting-blade), feat, Eldritch Invocation Options. Activities: no activity.
- Three Extra Attacks (three-extra-attacks), feat, Class Features. Activities: no activity.
- Trance (trance), feat, Elf. Activities: no activity.
- Transmuted Spell (transmuted-spell), feat, Metamagic Options. Activities: utility.
- Two Extra Attacks (two-extra-attacks), feat, Class Features. Activities: no activity.
- Two-Weapon Fighting (two-weapon-fighting), feat, Fighting Style Feats. Activities: no activity.
- Versatile (versatile), feat, Human. Activities: no activity.
- Weapon Mastery (weapon-mastery), feat, Class Features. Activities: no activity.
- Weapon Mastery (weapon-mastery), feat, Class Features. Activities: no activity.
- Weapon Mastery (weapon-mastery), feat, Class Features. Activities: no activity.
- Weapon Mastery (weapon-mastery), feat, Class Features. Activities: no activity.
- Weapon Mastery (weapon-mastery), feat, Class Features. Activities: no activity.
- Whispers of the Grave (whispers-of-the-grave), feat, Eldritch Invocation Options. Activities: utility.
- Wild Resurgence (wild-resurgence), feat, Class Features. Activities: utility.
- Words of Creation (words-of-creation), feat, Class Features. Activities: no activity.

## Species and backgrounds

18 items. A species or background with no activity is the sheet's origin.

0 have an instruction.

18 do not.

- Acolyte (acolyte), background
- Criminal (criminal), background
- Dragonborn (dragonborn), race
- Dwarf (dwarf), race
- Elf, Drow (elf-drow), race
- Elf, High (elf-high), race
- Elf, Wood (elf-wood), race
- Gnome, Forest (gnome-forest), race
- Gnome, Rock (gnome-rock), race
- Goliath (goliath), race
- Halfling (halfling), race
- Human (human), race
- Orc (orc), race
- Sage (sage), background
- Soldier (soldier), background
- Tiefling, Abyssal (tiefling-abyssal), race
- Tiefling, Chthonic (tiefling-chthonic), race
- Tiefling, Infernal (tiefling-infernal), race

## Other items in these packs

3 items that are not a spell, feat, class, subclass, species, or background.

- Book of Shadows (book-of-shadows), weapon, Eldritch Invocation Options. Activities: attack.
- Unarmed Strike (unarmed-strike), weapon, Class Features. Activities: attack, save. Statuses on the effect: grappled, prone.
- Unarmed Strike (unarmed-strike), weapon, Class Features. Activities: attack, save. Statuses on the effect: grappled, prone.

## Weapon masteries

Eight masteries are applied from `src/content/masteries.mjs` by `applyWeaponMastery` in `src/application/mastery.mjs`, which `src/application/resolve-activity.mjs` calls. dnd5e lists the same eight names and does not apply them.

- Cleave (`cleave`): on a hit, rolls the same attack against one other creature within 5 feet of the target.
- Graze (`graze`): on a miss, deals damage equal to the ability modifier used for the attack.
- Nick (`nick`): on a hit, sets `nickAvailable`. The next Light weapon attack that would cost a bonus action or an action spends that flag and does not spend the bonus action or the action.
- Push (`push`): on a hit, pushes a Huge or smaller creature 10 feet.
- Sap (`sap`): on a hit, the next attack against you from that creature has disadvantage.
- Slow (`slow`): on a hit, an effect reduces walk speed by 10 for one round.
- Topple (`topple`): on a hit, Constitution save or the target is prone. The DC is 8 plus proficiency plus the ability modifier used for the attack.
- Vex (`vex`): on a hit, your next attack against that creature has advantage.

## Instructions that match nothing in these packs

89 instructions. The item is not in spells24, feats24, classes24, or origins24 on this computer.

- Absorb Elements (absorb-elements). No note on the instruction.
- Ambush (ambush). When initiative is rolled through dnd5e.preRollInitiative, your roll gains your proficiency bonus.
- Arcane Ward (arcane-ward). No note on the instruction.
- Armor of Agathys ((no short name on the match)). No note on the instruction.
- Assassinate (assassinate). No note on the instruction.
- Aura of Alacrity (aura-of-alacrity). No note on the instruction.
- Aura of Conquest (aura-of-conquest). No note on the instruction.
- Aura of Purity (aura-of-purity). No note on the instruction.
- Aura of Warding (aura-of-warding). No note on the instruction.
- Bait and Switch (bait-and-switch). You trade places with the nearest ally within 5 feet. The superiority die is spent. Neither of you gains the AC bonus.
- Blade Ward (blade-ward). No note on the instruction.
- Blinding Smite (blinding-smite). On your hit, Constitution save or blinded.
- Boon of Energy Resistance (boon-of-energy-resistance). Once, you pick a damage type. An effect grants resistance to it.
- Boon of Fortitude (boon-of-fortitude). Once, maximum hit points increase by 40 and you gain 40 hit points.
- Boon of Recovery (boon-of-recovery). When you are damaged to 0 hit points, you heal half your maximum, at least 1. Once per round. The real boon is once per long rest.
- Boon of Speed (boon-of-speed). Once, walk speed increases by 30 feet.
- Caltrops (caltrops). No note on the instruction.
- Cause Fear (cause-fear). No note on the instruction.
- Charger (charger). No note on the instruction.
- Circle of Power (circle-of-power). No note on the instruction.
- Cleansing Touch (cleansing-touch). Using it removes charmed, frightened, paralyzed, and poisoned from you or the creature you chose. An arbitrary spell is not ended.
- Cloud of Daggers (cloud-of-daggers). No note on the instruction.
- Colossus Slayer (colossus-slayer). No note on the instruction.
- Commander's Strike (commanders-strike). The ally gains one reaction. You do not pick their weapon.
- Commanding Presence (commanding-presence). Using it stores your superiority die on your next ability check, attack, or save. It is not limited to Charisma.
- Crown of Madness (crown-of-madness). Wisdom save or charmed. The forced attack is not chosen.
- Crusher (crusher). No note on the instruction.
- Defensive Duelist (defensive-duelist). No note on the instruction.
- Deflect Missiles (deflect-missiles). No note on the instruction.
- Disarming Attack (disarming-attack). Strength save, DC 8 + Strength + proficiency. A failure applies an effect named Disarmed. The weapon stays in the creature's inventory.
- Distracting Strike (distracting-strike). No note on the instruction.
- Divine Fury (divine-fury). No note on the instruction.
- Dread Ambusher (dread-ambusher). During round 1, your hit deals an extra 1d8 piercing. The extra speed is not applied. The damage type is piercing, not the weapon's type.
- Dueling (dueling). No note on the instruction.
- Elemental Adept (elemental-adept). Once, you pick acid, cold, fire, lightning, or thunder. Your spells ignore resistance to that type. A 1 on a damage die is not raised to 2.
- Evard's Black Tentacles (evards-black-tentacles). No note on the instruction.
- Evasive Footwork (evasive-footwork). No note on the instruction.
- Feinting Attack (feinting-attack). No note on the instruction.
- Goading Attack (goading-attack). No note on the instruction.
- Grasp of Hadar (grasp-of-hadar). When you hit with Eldritch Blast, pull the target 10 feet.
- Greater Portent (greater-portent). No note on the instruction.
- Greater Portent (greater-portent-replace). No note on the instruction.
- Heavy Armor Master (heavy-armor-master). No note on the instruction.
- Horde Breaker (horde-breaker). When you hit, you may make a melee attack against a creature within 5 feet of the target. Once per turn.
- Hunger of Hadar (hunger-of-hadar). No note on the instruction.
- Illusory Self (illusory-self). No note on the instruction.
- Interception (interception). No note on the instruction.
- Lance of Lethargy (lance-of-lethargy). When you hit with Eldritch Blast, the target's walk speed is reduced by 10 feet for 1 round.
- Lucky (lucky). No note on the instruction.
- Lucky (lucky-reroll). No note on the instruction.
- Lunging Attack (lunging-attack). Your next melee attack this resolution reaches 5 feet farther. The bonus is used up by that attack.
- Mage Slayer (mage-slayer). No note on the instruction.
- Mage Slayer (mage-slayer-focus). No note on the instruction.
- Maneuvering Attack (maneuvering-attack). On your hit, an ally may move 15 feet. The move does not provoke while that grant remains, and it does not spend their speed. It is not half their speed.
- Menacing Attack (menacing-attack). No note on the instruction.
- Observant (observant). Passive Perception increases by 5. The change key is system.skills.prc.bonuses.passive.
- Oil (oil). No note on the instruction.
- Pack Tactics (pack-tactics). Your attack has advantage when an ally is within 5 feet of the target.
- Parry (parry). No note on the instruction.
- Patient Defense (patient-defense). Using the feature marks you dodging for this turn.
- Piercer (piercer). A critical hit that deals piercing damage adds 1d8 piercing. Rerolling one damage die is not implemented.
- Poisoner (poisoner). On your hit, Constitution save or 2d8 poison and poisoned. Poison resistance is not ignored.
- Polearm Master (polearm-master). No note on the instruction.
- Portent (portent). No note on the instruction.
- Portent (portent-replace). No note on the instruction.
- Precision Attack (precision-attack). No note on the instruction.
- Projected Ward (projected-ward). No note on the instruction.
- Protection (protection). No note on the instruction.
- Pushing Attack (pushing-attack). No note on the instruction.
- Rally (rally). No note on the instruction.
- Riposte (riposte). No note on the instruction.
- Sentinel (sentinel). No note on the instruction.
- Sentinel (sentinel). No note on the instruction.
- Sentinel (sentinel). No note on the instruction.
- Shield Master (shield-master). No note on the instruction.
- Silvery Barbs (silvery-barbs). No note on the instruction.
- Skulker (skulker). When your ranged attack misses, you become hidden if the light at your token is dim or dark. No recorded scene lights means you do not hide.
- Slasher (slasher). No note on the instruction.
- Speedy (speedy). Attacks against you have disadvantage. Once, you gain an effect named Speedy that adds 10 feet of walk speed.
- Speedy (speedy-pace). Adds 10 feet of walk speed once, when the effect is not already present.
- Step of the Wind (step-of-the-wind). Using the feature marks you dashed and disengaged for this turn.
- Sweeping Attack (sweeping-attack). No note on the instruction.
- Tavern Brawler (tavern-brawler). No note on the instruction.
- Tripping Attack (tripping-attack). No note on the instruction.
- Turn Undead (turn-undead, channel-divinity-turn-undead). Wisdom save or frightened, for a target whose creature type is undead.
- Unarmed Fighting (unarmed-fighting). A hit deals an extra 1d4 bludgeoning while the grappling flag lists a token. Releasing a grapple does not clear that flag.
- War Caster (war-caster). No note on the instruction.
- Warding Flare (warding-flare). No note on the instruction.
- Wrath of the Storm (wrath-of-the-storm). No note on the instruction.
