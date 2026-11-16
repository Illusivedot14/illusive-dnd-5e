/**
 * The remaining named features from the DAS gap list that the current steps can run.
 * Each `note` is the catalog text. Systems that cannot run these are listed in
 * docs/engine-comparison-das.md under "Systems not developed".
 */

const DC = "@spellSave";

function names(label) {
  return [new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")];
}

function pack(id, label, match, decl) {
  const mode = decl.mode ?? "passive";
  return {
    id,
    match,
    declarations: [{
      label,
      rule: `combat.reaction.${decl.id ?? id}`,
      do: [],
      ...(mode === "passive" ? {} : { cost: "reaction" }),
      ...decl,
      id: decl.id ?? id,
      mode
    }]
  };
}

function feat(id, label, decl) {
  return pack(id, label, { identifiers: [id], names: names(label) }, decl);
}

function spell(id, label, decl) {
  return pack(id, label, { types: ["spell"], identifiers: [id], names: names(label) }, decl);
}

export const REST_PACKS = Object.freeze([
  spell("suggestion", "Suggestion", {
    note: "Damage ends an effect named Suggestion.",
    on: "isDamaged",
    range: 30,
    if: { "trigger.effects": { has: "suggestion" } },
    do: [{ step: "endEffect", to: "trigger", name: "Suggestion" }]
  }),
  spell("calm-emotions", "Calm Emotions", {
    note: "Each target makes a Charisma save. A failure removes charmed and frightened.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "save", to: "targets", ability: "cha", dc: DC, endStatusesOnFail: ["charmed", "frightened"] }]
  }),
  spell("crown-of-madness", "Crown of Madness", {
    note: "Wisdom save or charmed. The forced attack is not chosen.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "save", to: "targets", ability: "wis", dc: DC, onFail: "charmed" }]
  }),
  spell("ensnaring-strike", "Ensnaring Strike", {
    note: "On your hit, Strength save or restrained.",
    on: "isHit",
    mode: "soft",
    if: { "self.isTrigger": true },
    do: [{ step: "save", to: "target", ability: "str", dc: DC, onFail: "restrained" }]
  }),
  spell("blinding-smite", "Blinding Smite", {
    note: "On your hit, Constitution save or blinded.",
    on: "isHit",
    mode: "soft",
    if: { "self.isTrigger": true },
    do: [{ step: "save", to: "target", ability: "con", dc: DC, onFail: "blinded" }]
  }),
  {
    id: "fire-shield",
    match: { effects: [/^fire shield$/i] },
    declarations: [{
      id: "fire-shield",
      label: "Fire Shield",
      rule: "combat.reaction.fire-shield",
      note: "A melee hit against the warded creature deals 2d8 fire to the attacker. The cold shield uses the same damage.",
      on: "isHit",
      mode: "passive",
      if: { all: [{ "self.isTarget": true }, { "activity.isMelee": true }] },
      do: [{ step: "damage", to: "trigger", value: "2d8", damageType: "fire" }]
    }]
  },
  spell("flesh-to-stone", "Flesh to Stone", {
    note: "Constitution save or restrained. The restrained creature repeats the save at the start of each of its turns.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [
      { step: "save", to: "targets", ability: "con", dc: DC, onFail: "restrained" },
      { step: "repeatSave", to: "targets", ability: "con", dc: DC, name: "Flesh to Stone" }
    ]
  }),
  spell("dispel-evil-and-good", "Dispel Evil and Good", {
    note: "Using the spell removes charmed, frightened, and possessed from you. Dismissal off the plane is not implemented.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [
      { step: "removeStatus", to: "self", status: "charmed" },
      { step: "removeStatus", to: "self", status: "frightened" },
      { step: "removeStatus", to: "self", status: "possessed" }
    ]
  }),
  spell("slow", "Slow", {
    note: "Wisdom save. A failure applies an effect named Slow that sets walk speed to half by an override of the current value is not possible, so the effect records the name and the turn denies the reaction.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{
      step: "save",
      to: "targets",
      ability: "wis",
      dc: DC,
      failEffect: {
        name: "Slow",
        changes: [{ key: "system.attributes.movement.walk", mode: 1, value: "0.5" }]
      }
    }]
  }),
  spell("confusion", "Confusion", {
    note: "Wisdom save or an effect named Confusion. The random action each turn is the existing confusion ticker when that effect is present.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "save", to: "targets", ability: "wis", dc: DC, flagOnFail: "confusion" }]
  }),
  spell("haste", "Haste", {
    note: "On cast, +2 AC. While an effect named Haste remains, each turn starts with one extra action. The spell does not end with a lethargy turn, and it does not limit the extra action to one attack.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{
      step: "applyEffect",
      to: "target",
      effect: {
        name: "Haste",
        duration: { rounds: 10 },
        changes: [{ key: "system.attributes.ac.bonus", mode: 2, value: "2" }]
      }
    }]
  }),
  spell("death-ward-cast", "Death Ward", {
    id: "death-ward-cast",
    note: "Casting applies an effect named Death Ward. That effect is what heals the creature at 0 hit points.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{
      step: "applyEffect",
      to: "target",
      effect: { name: "Death Ward", duration: { rounds: 100 } }
    }]
  }),
  {
    id: "death-ward",
    match: { effects: [/^death ward$/i] },
    declarations: [{
      id: "death-ward",
      label: "Death Ward",
      rule: "combat.reaction.death-ward",
      note: "When the warded creature is damaged to 0 hit points, it drops to 1 and the effect ends.",
      on: "isDamaged",
      mode: "passive",
      if: { all: [{ "self.isDamaged": true }, { "self.hp.value": { lte: 0 } }] },
      do: [
        { step: "heal", to: "self", value: 1 },
        { step: "endEffect", to: "self", name: "Death Ward" }
      ]
    }]
  },
  spell("power-word-stun", "Power Word Stun", {
    note: "If the target has 150 hit points or fewer, it is stunned. No save.",
    on: "castsSpell",
    if: { all: [{ "activity.isSource": true }, { "target.hp.value": { lte: 150 } }] },
    do: [{ step: "applyStatus", to: "target", status: "stunned" }]
  }),
  spell("power-word-kill", "Power Word Kill", {
    note: "If the target has 100 hit points or fewer, it takes damage equal to its current hit points.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "slayBelow", to: "target", hp: 100 }]
  }),
  {
    id: "blade-barrier",
    match: { types: ["spell"], identifiers: ["blade-barrier"], names: names("Blade Barrier") },
    declarations: [{
      id: "blade-barrier",
      label: "Blade Barrier",
      rule: "combat.spell.blade-barrier",
      note: "A 20-foot area, not a wall. Entering or starting a turn there: Dexterity save, 6d10 slashing, half on a success. It does not block movement.",
      on: "castsSpell",
      mode: "passive",
      if: { "activity.isSource": true },
      do: [{
        step: "zone",
        feet: 20,
        when: "enterOrTurn",
        follow: false,
        ability: "dex",
        dc: DC,
        damage: "6d10",
        damageType: "slashing",
        onSave: "half"
      }]
    }]
  },

  feat("piercer", "Piercer", {
    note: "A critical hit that deals piercing damage adds 1d8 piercing. Rerolling one damage die is not implemented.",
    on: "isHit",
    if: { all: [{ "self.isTrigger": true }, { "activity.critical": true }, { "damage.types": { has: "piercing" } }] },
    do: [{ step: "bonusDamage", to: "target", value: "1d8", damageType: "piercing" }]
  }),
  feat("unarmed-fighting", "Unarmed Fighting", {
    note: "A hit deals an extra 1d4 bludgeoning while the grappling flag lists a token. Releasing a grapple does not clear that flag.",
    on: "isHit",
    if: { all: [{ "self.isTrigger": true }, { "self.flags.illusive-dnd-5e.grappling": { exists: true } }] },
    do: [{ step: "damage", to: "target", value: "1d4", damageType: "bludgeoning" }]
  }),
  feat("speedy", "Speedy", {
    note: "Attacks against you have disadvantage. Once, you gain an effect named Speedy that adds 10 feet of walk speed.",
    on: "isAttacked",
    if: { "self.isTarget": true },
    do: [{ step: "disadvantage" }]
  }),
  feat("speedy-pace", "Speedy", {
    id: "speedy-pace",
    note: "Adds 10 feet of walk speed once, when the effect is not already present.",
    on: "turnStart",
    if: { all: [{ "self.isTrigger": true }, { not: { "self.effects": { has: "speedy" } } }] },
    do: [{
      step: "applyEffect",
      to: "self",
      effect: {
        name: "Speedy",
        changes: [{ key: "system.attributes.movement.walk", mode: 2, value: "10" }]
      }
    }]
  }),
  feat("alert", "Alert", {
    note: "Gaining the surprised condition removes it. After you roll initiative, a dialog can swap your total with an ally in the combat.",
    on: "gainsCondition",
    if: { all: [{ "self.isTarget": true }, { "condition.name": "surprised" }] },
    do: [{ step: "removeStatus", to: "self", status: "surprised" }]
  }),
  feat("observant", "Observant", {
    note: "Passive Perception increases by 5. The change key is system.skills.prc.bonuses.passive.",
    on: "turnStart",
    if: { all: [{ "self.isTrigger": true }, { not: { "self.effects": { has: "observant" } } }] },
    do: [{
      step: "applyEffect",
      to: "self",
      effect: {
        name: "Observant",
        changes: [{ key: "system.skills.prc.bonuses.passive", mode: 2, value: "5" }]
      }
    }]
  }),
  feat("skulker", "Skulker", {
    note: "When your ranged attack misses, you become hidden if the light at your token is dim or dark. No recorded scene lights means you do not hide.",
    on: "isMissed",
    if: { all: [{ "self.isTrigger": true }, { "activity.isRanged": true }] },
    do: [{ step: "veil", to: "self", status: "hidden" }]
  }),
  feat("poisoner", "Poisoner", {
    note: "On your hit, Constitution save or 2d8 poison and poisoned. Poison resistance is not ignored.",
    on: "isHit",
    mode: "soft",
    if: { "self.isTrigger": true },
    do: [{ step: "save", to: "target", ability: "con", dc: DC, damage: "2d8", damageType: "poison", onFail: "poisoned" }]
  }),

  feat("boon-of-combat-prowess", "Boon of Combat Prowess", {
    note: "When you miss, you may turn that miss into a hit. Once per round.",
    on: "isMissed",
    mode: "hard",
    selfTrigger: true,
    once: "round",
    if: { "self.isTrigger": true },
    do: [{ step: "connect" }]
  }),
  feat("boon-of-fate", "Boon of Fate", {
    note: "When you declare an attack, you may add 2d4 to the attack roll. Subtracting 2d4, and changing a save, are not implemented.",
    on: "attackDeclared",
    mode: "soft",
    selfTrigger: true,
    range: 60,
    if: { "self.isTrigger": true },
    do: [{ step: "attackBonus", value: "2d4" }]
  }),
  feat("boon-of-fortitude", "Boon of Fortitude", {
    note: "Once, maximum hit points increase by 40 and you gain 40 hit points.",
    on: "turnStart",
    if: { all: [{ "self.isTrigger": true }, { not: { "self.effects": { has: "boon of fortitude" } } }] },
    do: [
      { step: "heal", to: "self", value: 40 },
      {
        step: "applyEffect",
        to: "self",
        effect: {
          name: "Boon of Fortitude",
          changes: [{ key: "system.attributes.hp.max", mode: 2, value: "40" }]
        }
      }
    ]
  }),
  feat("boon-of-recovery", "Boon of Recovery", {
    note: "When you are damaged to 0 hit points, you heal half your maximum, at least 1. Once per round. The real boon is once per long rest.",
    on: "isDamaged",
    once: "round",
    if: { all: [{ "self.isDamaged": true }, { "self.hp.value": { lte: 0 } }] },
    do: [{ step: "heal", to: "self", value: "max(1, floor(@attributes.hp.max / 2))" }]
  }),
  feat("boon-of-speed", "Boon of Speed", {
    note: "Once, walk speed increases by 30 feet.",
    on: "turnStart",
    if: { all: [{ "self.isTrigger": true }, { not: { "self.effects": { has: "boon of speed" } } }] },
    do: [{
      step: "applyEffect",
      to: "self",
      effect: {
        name: "Boon of Speed",
        changes: [{ key: "system.attributes.movement.walk", mode: 2, value: "30" }]
      }
    }]
  }),

  feat("disarming-attack", "Disarming Attack", {
    note: "Strength save, DC 8 + Strength + proficiency. A failure applies an effect named Disarmed. The weapon stays in the creature's inventory.",
    on: "isHit",
    mode: "soft",
    if: { "self.isTrigger": true },
    do: [
      { step: "spendUses", amount: 1, item: "superiority" },
      {
        step: "save",
        to: "target",
        ability: "str",
        dc: "8 + @abilities.str.mod + @prof",
        failEffect: { name: "Disarmed", duration: { rounds: 1 } }
      }
    ]
  }),
  feat("studied-attacks", "Studied Attacks", {
    note: "When you miss, your next attack roll has advantage.",
    on: "isMissed",
    if: { "self.isTrigger": true },
    do: [{ step: "grantAdvantage", to: "self" }]
  }),
  feat("relentless-rage", "Relentless Rage", {
    note: "When you are damaged to 0 hit points, Constitution save. The DC starts at 10 and increases by 5 after each success.",
    on: "isDamaged",
    mode: "hard",
    if: { all: [{ "self.isDamaged": true }, { "self.hp.value": { lte: 0 } }] },
    do: [{ step: "save", to: "self", ability: "con", dc: "10 + 5 * @relentless", healOnSuccess: 1, climbFlag: "relentlessRage" }]
  }),
  feat("step-of-the-wind", "Step of the Wind", {
    note: "Using the feature marks you dashed and disengaged for this turn.",
    on: "usesFeature",
    if: { "activity.isSource": true },
    do: [{ step: "budget", key: "dashed" }, { step: "budget", key: "disengaged" }]
  }),
  feat("patient-defense", "Patient Defense", {
    note: "Using the feature marks you dodging for this turn.",
    on: "usesFeature",
    if: { "activity.isSource": true },
    do: [{ step: "budget", key: "dodging" }]
  }),
  pack("cunning-strike-trip", "Cunning Strike", { identifiers: ["cunning-strike"], names: names("Cunning Strike") }, {
    id: "cunning-strike-trip",
    note: "On your hit, Dexterity save or prone. A sneak-attack die is not removed.",
    on: "isHit",
    mode: "soft",
    if: { "self.isTrigger": true },
    do: [{ step: "save", to: "target", ability: "dex", dc: "8 + @abilities.dex.mod + @prof", onFail: "prone" }]
  }),
  pack("cunning-strike-poison", "Cunning Strike", { identifiers: ["cunning-strike"], names: names("Cunning Strike") }, {
    id: "cunning-strike-poison",
    note: "On your hit, Constitution save or poisoned. A sneak-attack die is not removed.",
    on: "isHit",
    mode: "soft",
    if: { "self.isTrigger": true },
    do: [{ step: "save", to: "target", ability: "con", dc: "8 + @abilities.dex.mod + @prof", onFail: "poisoned" }]
  }),
  pack("turn-undead", "Turn Undead", { identifiers: ["turn-undead", "channel-divinity-turn-undead"], names: names("Turn Undead") }, {
    note: "Wisdom save or frightened, for a target whose creature type is undead.",
    on: "usesFeature",
    if: { all: [{ "activity.isSource": true }, { "target.creatureType": "undead" }] },
    do: [{ step: "save", to: "targets", ability: "wis", dc: DC, onFail: "frightened" }]
  }),
  feat("cleansing-touch", "Cleansing Touch", {
    note: "Using it removes charmed, frightened, paralyzed, and poisoned from you or the creature you chose. An arbitrary spell is not ended.",
    on: "usesFeature",
    if: { "activity.isSource": true },
    do: [
      { step: "removeStatus", to: "target", status: "charmed" },
      { step: "removeStatus", to: "target", status: "frightened" },
      { step: "removeStatus", to: "target", status: "paralyzed" },
      { step: "removeStatus", to: "target", status: "poisoned" }
    ]
  }),
  feat("horde-breaker", "Horde Breaker", {
    note: "When you hit, you may make a melee attack against a creature within 5 feet of the target. Once per turn.",
    on: "isHit",
    mode: "soft",
    once: "turn",
    offer: "meleeWeapons",
    if: { all: [{ "self.isTrigger": true }, { "relation.nearTarget": { exists: true } }] },
    do: []
  }),
  feat("dread-ambusher", "Dread Ambusher", {
    note: "During round 1, your hit deals an extra 1d8 piercing. The extra speed is not applied. The damage type is piercing, not the weapon's type.",
    on: "isHit",
    if: { all: [{ "self.isTrigger": true }, { "combat.round": { lte: 1 } }] },
    do: [{ step: "damage", to: "target", value: "1d8", damageType: "piercing" }]
  }),
  {
    id: "agonizing-blast",
    match: { identifiers: ["agonizing-blast"], names: names("Agonizing Blast") },
    declarations: [{
      id: "agonizing-blast",
      label: "Agonizing Blast",
      rule: "combat.rider.agonizing-blast",
      note: "Eldritch Blast deals extra damage equal to your Charisma modifier. Other attacks do not.",
      on: "hitDamage",
      rider: { auto: true, passive: false, formula: "@abilities.cha.mod", attackIdentifier: "eldritch-blast" },
      do: [{ step: "bonusDamage", to: "target", value: "@abilities.cha.mod" }]
    }]
  },
  pack("repelling-blast", "Repelling Blast", { identifiers: ["repelling-blast"], names: names("Repelling Blast") }, {
    note: "When you hit with Eldritch Blast, push the target 10 feet.",
    on: "isHit",
    if: { all: [{ "self.isTrigger": true }, { "activity.identifier": "eldritch-blast" }] },
    do: [{ step: "push", to: "target", feet: 10 }]
  }),
  pack("grasp-of-hadar", "Grasp of Hadar", { identifiers: ["grasp-of-hadar"], names: names("Grasp of Hadar") }, {
    note: "When you hit with Eldritch Blast, pull the target 10 feet.",
    on: "isHit",
    if: { all: [{ "self.isTrigger": true }, { "activity.identifier": "eldritch-blast" }] },
    do: [{ step: "pull", to: "target", feet: 10 }]
  }),
  pack("lance-of-lethargy", "Lance of Lethargy", { identifiers: ["lance-of-lethargy"], names: names("Lance of Lethargy") }, {
    note: "When you hit with Eldritch Blast, the target's walk speed is reduced by 10 feet for 1 round.",
    on: "isHit",
    if: { all: [{ "self.isTrigger": true }, { "activity.identifier": "eldritch-blast" }] },
    do: [{
      step: "applyEffect",
      to: "target",
      effect: {
        name: "Lance of Lethargy",
        duration: { rounds: 1 },
        changes: [{ key: "system.attributes.movement.walk", mode: 2, value: "-10" }]
      }
    }]
  }),
  feat("devils-sight", "Devil's Sight", {
    note: "Once, darkvision increases by 120 feet.",
    on: "turnStart",
    if: { all: [{ "self.isTrigger": true }, { not: { "self.effects": { has: "devil's sight" } } }] },
    do: [{
      step: "applyEffect",
      to: "self",
      effect: {
        name: "Devil's Sight",
        changes: [{ key: "system.attributes.senses.darkvision", mode: 2, value: "120" }]
      }
    }]
  }),
  feat("bardic-inspiration", "Bardic Inspiration", {
    note: "The ally's next attack roll, check, or save adds your Bardic Inspiration die.",
    on: "usesFeature",
    if: { "activity.isSource": true },
    do: [{ step: "pendingDie", to: "ally", value: "@bardicDie" }]
  }),
  feat("pack-tactics", "Pack Tactics", {
    note: "Your attack has advantage when an ally is within 5 feet of the target.",
    on: "attackDeclared",
    if: { all: [{ "self.isTrigger": true }, { "relation.packMate": true }] },
    do: [{ step: "advantage" }]
  }),

  spell("wall-of-force", "Wall of Force", {
    note: "A closed circle centered on you. Creatures cannot enter or leave it, including you. It is not a wall line.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "zone", feet: 10, when: "enter", blocks: "both" }]
  }),
  spell("wall-of-stone", "Wall of Stone", {
    note: "A closed circle centered on you. Creatures cannot enter or leave it, including you. It is not a wall line.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "zone", feet: 10, when: "enter", blocks: "both" }]
  }),
  spell("forcecage", "Forcecage", {
    note: "A closed circle centered on you. Creatures cannot enter or leave it, including you. It is not a cage of bars.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "zone", feet: 20, when: "enter", blocks: "both" }]
  }),
  spell("antilife-shell", "Antilife Shell", {
    note: "A 10-foot circle that follows you. Other creatures cannot enter it. You can. It does not block spells.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "zone", feet: 10, when: "enter", blocks: "enter", exceptSource: true, follow: true }]
  }),
  spell("globe-of-invulnerability", "Globe of Invulnerability", {
    note: "A 10-foot circle that follows you. A spell of level 5 or lower does not affect a creature inside it. The slot is still spent.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "zone", feet: 10, when: "enter", wardLevel: 5, follow: true }]
  }),
  spell("antimagic-field", "Antimagic Field", {
    note: "A 10-foot circle that follows you. A spell cast by a creature inside it is cancelled. The slot is still spent.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "zone", feet: 10, when: "enter", suppress: true, follow: true }]
  }),
  spell("misty-step", "Misty Step", {
    note: "You move to 5 feet from the selected creature when that space is within 30 feet. No selected creature means you do not move.",
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "teleport", to: "target", feet: 30 }]
  }),
  spell("dispel-evil-dismiss", "Dispel Evil and Good", {
    id: "dispel-evil-dismiss",
    note: "A celestial, elemental, fey, fiend, or undead that fails a Charisma save is hidden and marked defeated in this combat. It is not moved to another scene.",
    on: "castsSpell",
    if: {
      all: [
        { "activity.isSource": true },
        { "target.creatureType": { in: ["celestial", "elemental", "fey", "fiend", "undead"] } }
      ]
    },
    do: [{ step: "save", to: "target", ability: "cha", dc: DC, banishOnFail: true }]
  }),

  feat("elemental-adept", "Elemental Adept", {
    note: "Once, you pick acid, cold, fire, lightning, or thunder. Your spells ignore resistance to that type. A 1 on a damage die is not raised to 2.",
    on: "turnStart",
    if: { all: [{ "self.isTrigger": true }, { not: { "self.flags.illusive-dnd-5e.elementalAdept": { exists: true } } }] },
    do: [{ step: "chooseType", key: "elementalAdept", types: ["acid", "cold", "fire", "lightning", "thunder"], bypass: true, spells: true }]
  }),
  feat("boon-of-energy-resistance", "Boon of Energy Resistance", {
    note: "Once, you pick a damage type. An effect grants resistance to it.",
    on: "turnStart",
    if: { all: [{ "self.isTrigger": true }, { not: { "self.flags.illusive-dnd-5e.energyResistance": { exists: true } } }] },
    do: [{
      step: "chooseType",
      key: "energyResistance",
      types: ["acid", "cold", "fire", "force", "lightning", "necrotic", "poison", "psychic", "radiant", "thunder"],
      resist: true
    }]
  }),
  feat("boon-of-irresistible-offense", "Boon of Irresistible Offense", {
    note: "Your weapon attacks ignore resistance to bludgeoning, piercing, and slashing. The extra critical die is not added.",
    on: "turnStart",
    if: { all: [{ "self.isTrigger": true }, { not: { "self.flags.illusive-dnd-5e.irresistibleOffense": { exists: true } } }] },
    do: [{
      step: "chooseType",
      key: "irresistibleOffense",
      types: ["bludgeoning", "piercing", "slashing"],
      all: true,
      bypass: true,
      attacks: true
    }]
  }),
  feat("boon-of-spell-recall", "Boon of Spell Recall", {
    note: "Using it restores the highest expended spell slot of level 4 or lower. It does not roll the d6 from the boon.",
    on: "usesFeature",
    if: { "activity.isSource": true },
    do: [{ step: "restoreSlot", level: 4 }]
  }),
  feat("boon-of-the-night-spirit", "Boon of the Night Spirit", {
    note: "At the start of your turn you are invisible while the light at your token is dim or dark, and visible again in bright light. No recorded scene lights means no change.",
    on: "turnStart",
    if: { "self.isTrigger": true },
    do: [{ step: "veil", to: "self", status: "invisible" }]
  }),
  feat("bait-and-switch", "Bait and Switch", {
    note: "You trade places with the nearest ally within 5 feet. The superiority die is spent. Neither of you gains the AC bonus.",
    on: "usesFeature",
    if: { "activity.isSource": true },
    do: [{ step: "spendUses", amount: 1, item: "superiority" }, { step: "swap" }]
  }),
  feat("maneuvering-attack", "Maneuvering Attack", {
    note: "On your hit, an ally may move 15 feet. The move does not provoke while that grant remains, and it does not spend their speed. It is not half their speed.",
    on: "isHit",
    mode: "soft",
    if: { "self.isTrigger": true },
    do: [{ step: "spendUses", amount: 1, item: "superiority" }, { step: "grantMove", to: "ally", feet: 15 }]
  }),
  feat("instinctive-pounce", "Instinctive Pounce", {
    note: "Using it lets you move 15 feet without spending speed or provoking. It is not half your speed.",
    on: "usesFeature",
    if: { "activity.isSource": true },
    do: [{ step: "grantMove", to: "self", feet: 15 }]
  }),
  feat("tactical-shift", "Tactical Shift", {
    note: "An ally may move 15 feet without spending speed or provoking. It is not half their speed.",
    on: "usesFeature",
    if: { "activity.isSource": true },
    do: [{ step: "grantMove", to: "ally", feet: 15 }]
  }),
  feat("commanders-strike", "Commander's Strike", {
    note: "The ally gains one reaction. You do not pick their weapon.",
    on: "usesFeature",
    if: { "activity.isSource": true },
    do: [{ step: "spendUses", amount: 1, item: "superiority" }, { step: "grantReaction", to: "ally" }]
  }),
  feat("lunging-attack", "Lunging Attack", {
    note: "Your next melee attack this resolution reaches 5 feet farther. The bonus is used up by that attack.",
    on: "usesFeature",
    if: { "activity.isSource": true },
    do: [{ step: "spendUses", amount: 1, item: "superiority" }, { step: "setFlag", to: "self", key: "reachBonus", value: 5 }]
  }),
  feat("ambush", "Ambush", {
    note: "When initiative is rolled through dnd5e.preRollInitiative, your roll gains your proficiency bonus.",
    on: "turnStart",
    if: { all: [{ "self.isTrigger": true }, { not: { "self.flags.illusive-dnd-5e.ambushNoted": { exists: true } } }] },
    do: [{ step: "setFlag", to: "self", key: "ambushNoted", value: 1 }]
  }),
  feat("remarkable-athlete", "Remarkable Athlete", {
    note: "Initiative rolls through dnd5e.preRollInitiative are marked advantage. Athletics checks through dnd5e.preRollSkill gain half your proficiency, rounded down. Jump distance is not increased.",
    on: "turnStart",
    if: { all: [{ "self.isTrigger": true }, { not: { "self.flags.illusive-dnd-5e.athleteNoted": { exists: true } } }] },
    do: [{ step: "setFlag", to: "self", key: "athleteNoted", value: 1 }]
  }),
  feat("tactical-mind", "Tactical Mind", {
    note: "Using it stores 1d10 on your next ability check, attack, or save. It does not change a check you already failed.",
    on: "usesFeature",
    if: { "activity.isSource": true },
    do: [{ step: "pendingDie", to: "self", value: "1d10" }]
  }),
  feat("commanding-presence", "Commanding Presence", {
    note: "Using it stores your superiority die on your next ability check, attack, or save. It is not limited to Charisma.",
    on: "usesFeature",
    if: { "activity.isSource": true },
    do: [{ step: "spendUses", amount: 1, item: "superiority" }, { step: "pendingDie", to: "self", value: "@superiorityDie" }]
  })
]);
