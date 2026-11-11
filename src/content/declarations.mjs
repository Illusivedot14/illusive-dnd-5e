/**
 * Shipped rule declarations, keyed to dnd5e items or active effects.
 *
 * match.identifiers  — item system.identifier on the listening creature
 * match.names        — item name fallback (imported content without identifiers)
 * match.types        — only these item types ("spell": the Shield spell, not a shield)
 * match.reactionOnly — only items activated as a reaction (2024 versions of
 *                      features that 2014 made an action)
 * match.effects      — active effect names on the listening creature (spells
 *                      cast on someone else: Protection from Evil and Good)
 *
 * Shape of each declaration: src/domain/triggers/declarations.mjs.
 * Citations: src/rules/catalog.mjs.
 */

const PHYSICAL = ["bludgeoning", "piercing", "slashing"];
const PFEG_TYPES = ["aberration", "celestial", "elemental", "fey", "fiend", "undead"];

/** Hostile to the triggering creature, or no disposition known. */
const NOT_FRIENDLY = { not: { "relation.hostile": false } };
const DEFLECT_REDUCE = "1d10 + @abilities.dex.mod + @monkLevel";

/** One prompted reaction on a matched item. */
function reaction(id, label, match, decl) {
  return {
    id,
    match,
    declarations: [{ id, label, rule: `combat.reaction.${id}`, cost: "reaction", do: [], ...decl }]
  };
}

/** Reactions: prompted on the reacting creature's own screen. Ready stays in reactions/registry.mjs. */
const REACTIONS = [
  reaction("shield", "Shield", { types: ["spell"], identifiers: ["shield"], names: [/^shield$/i] }, {
    on: "isHit",
    mode: "hard",
    if: { all: [{ "self.isTarget": true }, { not: { "activity.isAttack": false } }] },
    do: [{ step: "acBonus", to: "self", value: 5 }]
  }),
  reaction("parry", "Parry", { identifiers: ["parry"], names: [/^parry$/i] }, {
    on: "isHit",
    mode: "hard",
    if: { all: [{ "self.isTarget": true }, { "activity.isMelee": true }] },
    do: [{ step: "acBonus", to: "self", value: "@parryBonus" }]
  }),
  reaction("counterspell", "Counterspell", { types: ["spell"], identifiers: ["counterspell"], names: [/counterspell/i] }, {
    on: "castsSpell",
    mode: "hard",
    range: 60,
    sight: true,
    if: NOT_FRIENDLY,
    do: [{ step: "counterspell" }]
  }),
  reaction("silvery-barbs", "Silvery Barbs", {
    types: ["spell"],
    identifiers: ["silvery-barbs"],
    names: [/silvery\s*barbs/i]
  }, {
    on: ["isHit", "savedSave", "checkSucceeded"],
    mode: "hard",
    range: 60,
    sight: true,
    if: { all: [NOT_FRIENDLY, { "self.isTarget": false }] },
    do: [{ step: "reroll", keep: "lower" }, { step: "grantAdvantage", to: "ally" }]
  }),
  reaction("cutting-words", "Cutting Words", { identifiers: ["cutting-words"], names: [/cutting\s*words/i] }, {
    on: "isHit",
    mode: "hard",
    range: 60,
    sight: true,
    if: NOT_FRIENDLY,
    do: [{ step: "attackPenalty", value: "@bardicDie" }]
  }),
  reaction("protection", "Protection", {
    identifiers: ["protection"],
    names: [/^(fighting\s*style:\s*)?protection$/i]
  }, {
    on: "attackDeclared",
    mode: "hard",
    sight: true,
    if: {
      all: [
        { "self.isTarget": false },
        { "relation.nearTarget": { exists: true } },
        NOT_FRIENDLY,
        { "self.wieldsShield": true }
      ]
    },
    do: [{ step: "disadvantage" }, { step: "lingeringDisadvantage" }]
  }),
  reaction("countercharm", "Countercharm", {
    reactionOnly: true,
    identifiers: ["countercharm"],
    names: [/countercharm/i]
  }, {
    on: "failedSave",
    mode: "hard",
    range: 30,
    selfTrigger: true,
    if: { all: [{ "activity.charmOrFear": true }, { "relation.hostile": false }] },
    do: [{ step: "reroll", keep: "new", advantage: true }]
  }),
  reaction("uncanny-dodge", "Uncanny Dodge", { identifiers: ["uncanny-dodge"], names: [/uncanny\s*dodge/i] }, {
    on: "damageKnown",
    mode: "hard",
    sight: true,
    if: { all: [{ "self.isTarget": true }, { "activity.isAttack": true }] },
    do: [{ step: "damageMultiplier", to: "self", value: 0.5 }]
  }),
  reaction("absorb-elements", "Absorb Elements", {
    types: ["spell"],
    identifiers: ["absorb-elements"],
    names: [/absorb\s*elements/i]
  }, {
    on: "damageKnown",
    mode: "hard",
    if: { all: [{ "self.isTarget": true }, { "activity.elemental": true }] },
    do: [
      { step: "resist", to: "self", types: "elemental" },
      { step: "hitRider", to: "self", formula: "(@slotLevel)d6", damageType: "elemental", meleeOnly: true, ownTurnOnly: true }
    ]
  }),
  {
    ...reaction("deflect", "Deflect Missiles", { identifiers: ["deflect-missiles"], names: [/deflect\s*missiles/i] }, {
      on: "damageKnown",
      mode: "hard",
      if: {
        all: [
          { "self.isTarget": true },
          { "activity.isAttack": true },
          { "activity.isRanged": true },
          { not: { "activity.isWeapon": false } }
        ]
      },
      do: [{ step: "damageReduce", to: "self", value: DEFLECT_REDUCE }]
    }),
    id: "deflect-missiles"
  },
  {
    ...reaction("deflect", "Deflect Attacks", { identifiers: ["deflect-attacks"], names: [/deflect\s*attacks/i] }, {
      on: "damageKnown",
      mode: "hard",
      if: {
        all: [
          { "self.isTarget": true },
          { "activity.isAttack": true },
          { "damage.types": { hasAny: PHYSICAL } }
        ]
      },
      do: [{ step: "damageReduce", to: "self", value: DEFLECT_REDUCE }]
    }),
    id: "deflect-attacks"
  },
  {
    ...reaction("deflect", "Deflect Energy", { identifiers: ["deflect-energy"], names: [/deflect\s*energy/i] }, {
      on: "damageKnown",
      mode: "hard",
      if: { all: [{ "self.isTarget": true }, { "activity.isAttack": true }] },
      do: [{ step: "damageReduce", to: "self", value: DEFLECT_REDUCE }]
    }),
    id: "deflect-energy"
  },
  reaction("stones-endurance", "Stone's Endurance", {
    identifiers: ["stones-endurance", "stone-s-endurance"],
    names: [/stone'?s\s*endurance/i]
  }, {
    on: "damageKnown",
    mode: "hard",
    if: { "self.isTarget": true },
    do: [{ step: "damageReduce", to: "self", value: "1d12 + @abilities.con.mod" }]
  }),
  reaction("superior-hunters-defense", "Superior Hunter's Defense", {
    reactionOnly: true,
    identifiers: ["superior-hunters-defense", "superior-hunter-s-defense"],
    names: [/superior\s*hunter'?s\s*defen[cs]e/i]
  }, {
    on: "damageKnown",
    mode: "hard",
    if: { all: [{ "self.isTarget": true }, { "damage.typeCount": { gt: 0 } }] },
    do: [
      { step: "resist", to: "self", types: "trigger" },
      { step: "resistEffect", to: "self", types: "trigger", until: "currentTurnEnd" }
    ]
  }),
  reaction("interception", "Interception", {
    identifiers: ["interception"],
    names: [/^(fighting\s*style:\s*)?interception$/i]
  }, {
    on: "damageKnown",
    mode: "hard",
    sight: true,
    if: {
      all: [
        { "activity.isAttack": true },
        { "self.isTarget": false },
        { "relation.nearTarget": { exists: true } },
        NOT_FRIENDLY
      ]
    },
    do: [{ step: "damageReduce", to: "nearTarget", value: "1d10 + @prof" }]
  }),
  reaction("feather-fall", "Feather Fall", { types: ["spell"], identifiers: ["feather-fall"], names: [/feather\s*fall/i] }, {
    on: "falls",
    mode: "hard",
    range: 60,
    sight: true,
    selfTrigger: true,
    do: [
      { step: "damageMultiplier", to: "target", value: 0 },
      {
        step: "applyEffect",
        to: "nearby",
        feet: 60,
        limit: 5,
        effect: {
          name: "Feather Fall",
          duration: { rounds: 1 },
          flags: { "illusive-dnd-5e": { featherFall: true } }
        }
      }
    ]
  }),
  reaction("slow-fall", "Slow Fall", { identifiers: ["slow-fall"], names: [/slow\s*fall/i] }, {
    on: "falls",
    mode: "hard",
    selfTrigger: true,
    if: { "self.isTrigger": true },
    do: [{ step: "damageReduce", to: "self", value: "5 * @monkLevel" }]
  }),
  reaction("hellish-rebuke", "Hellish Rebuke", {
    types: ["spell"],
    identifiers: ["hellish-rebuke"],
    names: [/hellish\s*rebuke/i]
  }, {
    on: "isDamaged",
    mode: "soft",
    range: 60,
    sight: true,
    if: { "self.isDamaged": true }
  }),
  reaction("storms-thunder", "Storm's Thunder", {
    identifiers: ["storms-thunder", "storm-s-thunder"],
    names: [/storm'?s\s*thunder/i]
  }, {
    on: "isDamaged",
    mode: "soft",
    range: 60,
    if: { "self.isDamaged": true }
  }),
  reaction("wrath-of-the-storm", "Wrath of the Storm", {
    identifiers: ["wrath-of-the-storm"],
    names: [/wrath\s*of\s*the\s*storm/i]
  }, {
    on: "isDamaged",
    mode: "soft",
    range: 5,
    sight: true,
    if: { all: [{ "self.isDamaged": true }, { "activity.isAttack": true }] }
  }),
  reaction("retaliation", "Retaliation", { identifiers: ["retaliation"], names: [/^retaliation$/i] }, {
    on: "isDamaged",
    mode: "soft",
    range: 5,
    offer: "meleeWeapons",
    if: { "self.isDamaged": true }
  }),
  reaction("riposte", "Riposte", { identifiers: ["riposte"], names: [/riposte/i] }, {
    on: "isMissed",
    mode: "soft",
    range: 5,
    offer: "meleeWeapons",
    if: {
      all: [
        { "self.isTarget": true },
        { "activity.isMelee": true },
        { not: { "self.usesLeft.superiority": 0 } }
      ]
    },
    do: [
      { step: "spendUses", item: "superiority" },
      { step: "hitRider", to: "self", formula: "@superiorityDie", meleeOnly: true }
    ]
  })
];

const BASE_CONTENT = [
  ...REACTIONS,
  {
    id: "blur",
    match: { effects: [/^blur$/i] },
    declarations: [{
      id: "blur",
      label: "Blur",
      rule: "combat.trigger.blur",
      on: "attackDeclared",
      if: {
        all: [
          { "self.isTarget": true },
          { "trigger.senses.blindsight": { lte: 0 } },
          { "trigger.senses.truesight": { lte: 0 } }
        ]
      },
      do: [{ step: "disadvantage" }]
    }]
  },
  {
    id: "protection-from-evil-and-good",
    match: { effects: [/^protection from evil (and|&) good$/i] },
    declarations: [{
      id: "protection-from-evil-and-good",
      label: "Protection from Evil and Good",
      rule: "combat.trigger.protection-from-evil-and-good",
      on: "attackDeclared",
      if: {
        all: [
          { "self.isTarget": true },
          { "trigger.creatureType": { in: PFEG_TYPES } }
        ]
      },
      do: [{ step: "disadvantage" }]
    }, {
      id: "protection-from-evil-and-good-ward",
      label: "Protection from Evil and Good",
      rule: "combat.trigger.protection-from-evil-and-good",
      on: "gainsCondition",
      if: {
        all: [
          { "self.isTarget": true },
          { "condition.name": { in: ["charmed", "frightened", "possessed"] } },
          { "trigger.creatureType": { in: PFEG_TYPES } }
        ]
      },
      do: [{ step: "removeStatus", to: "self", status: "condition" }]
    }]
  },
  {
    id: "armor-of-agathys",
    match: { effects: [/^armor of agathys$/i] },
    declarations: [{
      id: "armor-of-agathys",
      label: "Armor of Agathys",
      rule: "combat.trigger.armor-of-agathys",
      on: "isHit",
      if: {
        all: [
          { "self.isTarget": true },
          { "activity.isMelee": true },
          { "self.hp.temp": { gt: 0 } }
        ]
      },
      do: [{ step: "damage", to: "trigger", value: "5 * @sourceLevel", damageType: "cold" }]
    }, {
      id: "armor-of-agathys-end",
      label: "Armor of Agathys",
      rule: "combat.trigger.armor-of-agathys",
      on: "isDamaged",
      if: {
        all: [
          { "self.isDamaged": true },
          { "self.effects": { has: "armor of agathys" } },
          { "self.hp.temp": { lte: 0 } }
        ]
      },
      do: [{ step: "endEffect", to: "self", name: "Armor of Agathys" }]
    }]
  },
  {
    id: "heavy-armor-master",
    match: { identifiers: ["heavy-armor-master"], names: [/^heavy armou?r master$/i] },
    declarations: [
      {
        id: "heavy-armor-master-2024",
        label: "Heavy Armor Master",
        rule: "combat.trigger.heavy-armor-master",
        edition: "2024",
        on: "damageKnown",
        if: {
          all: [
            { "self.isTarget": true },
            { "activity.isAttack": true },
            { "self.armor.heavy": true },
            { "damage.types": { hasAny: PHYSICAL } }
          ]
        },
        do: [{ step: "damageReduce", to: "self", value: "@prof" }]
      },
      {
        id: "heavy-armor-master-2014",
        label: "Heavy Armor Master",
        rule: "combat.trigger.heavy-armor-master",
        edition: "2014",
        on: "damageKnown",
        if: {
          all: [
            { "self.isTarget": true },
            { "activity.isWeapon": true },
            { "self.armor.heavy": true },
            { "damage.types": { hasAny: PHYSICAL } },
            { not: { "activity.magical": true } }
          ]
        },
        do: [{ step: "damageReduce", to: "self", value: 3 }]
      }
    ]
  },
  {
    id: "dark-ones-blessing",
    match: { identifiers: ["dark-ones-blessing", "dark-one-s-blessing"], names: [/^dark one'?s blessing$/i] },
    declarations: [{
      id: "dark-ones-blessing",
      label: "Dark One's Blessing",
      rule: "combat.trigger.dark-ones-blessing",
      on: "isDamaged",
      if: {
        all: [
          { "self.isTrigger": true },
          { "damaged.droppedHostile": { gt: 0 } },
          { "damaged.droppedFeet": { lte: 10 } }
        ]
      },
      do: [{ step: "tempHp", to: "self", value: "max(1, @abilities.cha.mod + @classes.warlock.levels)" }]
    }]
  },
  {
    id: "defensive-duelist",
    match: { identifiers: ["defensive-duelist"], names: [/^defensive duelist$/i] },
    declarations: [{
      id: "defensive-duelist",
      label: "Defensive Duelist",
      rule: "combat.trigger.defensive-duelist",
      on: "isHit",
      mode: "hard",
      cost: "reaction",
      if: {
        all: [
          { "self.isTarget": true },
          { "activity.isMelee": true },
          { "self.wieldsFinesse": true }
        ]
      },
      do: [{ step: "acBonus", to: "self", value: "@prof" }]
    }]
  }
];

/** Bonus damage on a hit. `rider.passive` is automatic and once a turn; otherwise the player confirms. */
const HIT_RIDERS = [
  rider("divine-smite", "Divine Smite", {
    identifiers: ["divine-smite"],
    names: [/divine\s*smite/i]
  }, { auto: false }),
  rider("sneak-attack", "Sneak Attack", {
    identifiers: ["sneak-attack"],
    names: [/sneak\s*attack/i]
  }, { auto: false }),
  rider("eldritch-smite", "Eldritch Smite", {
    identifiers: ["eldritch-smite"],
    names: [/eldritch\s*smite/i]
  }, { auto: false }),
  rider("hex", "Hex", { identifiers: ["hex"], names: [/^hex$/i] }, { auto: true, mark: true }),
  rider("hunters-mark", "Hunter's Mark", {
    identifiers: ["hunters-mark"],
    names: [/hunter'?s\s*mark/i]
  }, { auto: true, mark: true }),
  rider("colossus-slayer", "Colossus Slayer", {
    identifiers: ["colossus-slayer"],
    names: [/colossus\s*slayer/i]
  }, { auto: true, passive: true, formula: "1d8", oncePerTurn: true }),
  rider("divine-fury", "Divine Fury", {
    identifiers: ["divine-fury"],
    names: [/divine\s*fury/i]
  }, { auto: true, passive: true, formula: "1d6+@halfLevel", oncePerTurn: true, type: "radiant" })
];

function rider(id, label, match, riderSpec) {
  const formula = riderSpec.formula ?? "0";
  return {
    id,
    match,
    declarations: [{
      id,
      label,
      rule: `combat.rider.${id}`,
      on: "hitDamage",
      rider: riderSpec,
      do: [{ step: "bonusDamage", to: "target", value: formula }]
    }]
  };
}

const SAVE_BONUS_KEY = "system.rolls.ability.save.bonus";

/** Auras the creature carries. The sync reads `aura`. */
const AURAS = [
  aura("aura-of-protection", "Aura of Protection", {
    identifiers: ["aura-of-protection"],
    names: [/^aura of protection$/i]
  }, {
    affects: "ally",
    defaultFeet: 10,
    scalePath: "paladin.aura",
    bonus: { key: SAVE_BONUS_KEY, type: "add", from: "chaModMin1" },
    incapacitatedBlocks: true
  }),
  aura("aura-of-courage", "Aura of Courage", {
    identifiers: ["aura-of-courage"],
    names: [/^aura of courage$/i]
  }, {
    affects: "ally",
    defaultFeet: 10,
    scalePath: "paladin.aura",
    immunities: ["frightened"],
    incapacitatedBlocks: true
  }),
  aura("aura-of-devotion", "Aura of Devotion", {
    identifiers: ["aura-of-devotion"],
    names: [/^aura of devotion$/i]
  }, {
    affects: "ally",
    defaultFeet: 10,
    scalePath: "paladin.aura",
    immunities: ["charmed"],
    incapacitatedBlocks: true
  }),
  aura("spirit-guardians", "Spirit Guardians", {
    identifiers: ["spirit-guardians"],
    names: [/^spirit\s*guardians$/i]
  }, {
    affects: "enemy",
    defaultFeet: 15,
    damaging: {
      formula: "3d8",
      type: "radiant",
      saveAbility: "wis",
      onSave: "half",
      turn: "start"
    },
    incapacitatedBlocks: false,
    requiresConcentration: true
  }),
  aura("aura-of-life", "Aura of Life", {
    identifiers: ["aura-of-life"],
    names: [/^aura\s*of\s*life$/i]
  }, {
    affects: "ally",
    defaultFeet: 30,
    immunities: [],
    resistances: ["necrotic"],
    incapacitatedBlocks: false,
    requiresConcentration: true
  }),
  aura("aura-of-purity", "Aura of Purity", {
    identifiers: ["aura-of-purity"],
    names: [/^aura\s*of\s*purity$/i]
  }, {
    affects: "ally",
    defaultFeet: 30,
    immunities: ["blinded", "charmed", "deafened", "frightened", "paralyzed", "poisoned", "stunned"],
    incapacitatedBlocks: false,
    requiresConcentration: true
  })
];

function aura(id, label, match, auraSpec) {
  return {
    id,
    match,
    declarations: [{
      id,
      label,
      rule: `combat.aura.${id}`,
      on: "aura",
      aura: { ...auraSpec, effectName: label },
      do: [{ step: "note", text: label }]
    }]
  };
}

const SPELL_DC = "8 + @abilities.wis.mod + @prof";

/** Spells and items that place a zone: a beam you move, or terrain. */
const ZONES = [
  {
    id: "moonbeam",
    match: { types: ["spell"], identifiers: ["moonbeam"], names: [/^moonbeam$/i] },
    declarations: [
      {
        id: "moonbeam",
        label: "Moonbeam",
        rule: "combat.spell.moonbeam",
        on: "castsSpell",
        if: { all: [{ "activity.isSource": true }, { not: { "activity.activation": "bonus" } }] },
        do: [{
          step: "zone",
          feet: 5,
          when: "enterOrTurn",
          follow: false,
          movable: true,
          move: "bonus",
          moveFeet: 60,
          ability: "con",
          dc: SPELL_DC,
          damage: "2d10",
          damageType: "radiant",
          onSave: "half"
        }]
      },
      {
        id: "moonbeam-move",
        label: "Move Moonbeam",
        rule: "combat.spell.moonbeam",
        on: "castsSpell",
        if: { all: [{ "activity.isSource": true }, { "activity.activation": "bonus" }] },
        do: [{ step: "moveZone", feet: 60, to: "target" }]
      }
    ]
  },
  {
    id: "web",
    match: { types: ["spell"], identifiers: ["web"], names: [/^web$/i] },
    declarations: [{
      id: "web",
      label: "Web",
      rule: "combat.spell.web",
      on: "castsSpell",
      if: { "activity.isSource": true },
      do: [{
        step: "zone",
        feet: 20,
        when: "enter",
        follow: false,
        ability: "dex",
        dc: SPELL_DC,
        onFail: "restrained",
        difficult: true,
        terrain: true,
        flammable: true,
        igniteDamage: "2d4",
        igniteWhen: "turnStart",
        burnAway: true
      }]
    }]
  },
  {
    id: "oil",
    match: { identifiers: ["oil"], names: [/^oil( flask)?$/i] },
    declarations: [{
      id: "oil",
      label: "Oil",
      rule: "combat.spell.oil",
      on: "castsSpell",
      if: { "activity.isSource": true },
      do: [{
        step: "zone",
        feet: 5,
        when: "enterOrTurn",
        follow: false,
        terrain: true,
        flammable: true,
        damage: "0",
        igniteDamage: "5",
        igniteWhen: "enterOrTurn"
      }]
    }]
  },
  {
    id: "caltrops",
    match: { identifiers: ["caltrops"], names: [/^caltrops$/i] },
    declarations: [{
      id: "caltrops",
      label: "Caltrops",
      rule: "combat.spell.caltrops",
      on: "castsSpell",
      if: { "activity.isSource": true },
      do: [{
        step: "zone",
        feet: 5,
        when: "enter",
        follow: false,
        terrain: true,
        ability: "dex",
        dc: 15,
        damage: "1",
        damageType: "piercing",
        slowFeet: 10
      }]
    }]
  }
];

export const CONTENT = Object.freeze([
  ...BASE_CONTENT,
  ...HIT_RIDERS,
  ...AURAS,
  ...ZONES
]);
