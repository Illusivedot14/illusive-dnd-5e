/**
 * Phases B and C — declarations keyed to official item identifiers.
 * Name patterns are the import fallback when an item has no identifier.
 * Activity documents are the item's own; nothing here copies an activity id.
 */

const DC = "@spellSave";
const NOT_FRIENDLY = { not: { "relation.hostile": false } };
const HALTED = {
  name: "Halted",
  duration: { rounds: 1 },
  changes: [{ key: "system.attributes.movement.walk", mode: 5, value: "0" }]
};

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

function zone(id, label, step) {
  return {
    id,
    match: { types: ["spell"], identifiers: [id], names: names(label) },
    declarations: [{
      id,
      label,
      rule: `combat.spell.${id}`,
      on: "castsSpell",
      mode: "passive",
      if: { "activity.isSource": true },
      do: [{ step: "zone", dc: DC, follow: false, ...step }]
    }]
  };
}

const sentinelMatch = { identifiers: ["sentinel"], names: names("Sentinel") };

export const PHASE_PACKS = Object.freeze([
  // ---- B. High-traffic reactions ---------------------------------------
  pack("sentinel", "Sentinel", sentinelMatch, {
    on: "allyIsHit",
    mode: "soft",
    offer: "meleeWeapons",
    range: 5,
    if: { "relation.targetAlly": true },
    do: [{ step: "setFlag", key: "sentinelPending" }]
  }),
  pack("sentinel-disengage", "Sentinel", sentinelMatch, {
    id: "sentinel-disengage",
    on: "enemyDisengages",
    mode: "soft",
    offer: "meleeWeapons",
    range: 5,
    if: NOT_FRIENDLY,
    do: [{ step: "setFlag", key: "sentinelPending" }]
  }),
  {
    id: "sentinel-halt",
    match: sentinelMatch,
    declarations: [{
      id: "sentinel-halt",
      label: "Sentinel",
      rule: "combat.reaction.sentinel-halt",
      on: "isHit",
      mode: "passive",
      if: {
        all: [
          { "self.isTrigger": true },
          { "self.flags.illusive-dnd-5e.sentinelPending": true }
        ]
      },
      do: [{ step: "applyEffect", to: "target", effect: HALTED }]
    }]
  },
  feat("polearm-master", "Polearm Master", {
    on: "entersReach",
    mode: "soft",
    offer: "meleeWeapons",
    if: { all: [NOT_FRIENDLY, { "relation.enteringReach": true }] },
    do: [{ step: "setFlag", key: "sentinelPending" }]
  }),
  feat("war-caster", "War Caster", {
    on: "leavesReach",
    mode: "soft",
    offer: "reactionSpells",
    if: NOT_FRIENDLY,
    do: []
  }),
  feat("lucky", "Lucky", {
    on: "isAttacked",
    mode: "hard",
    if: { "self.isTarget": true },
    do: [{ step: "disadvantage" }, { step: "spendUses", amount: 1 }]
  }),
  feat("lucky-reroll", "Lucky", {
    id: "lucky-reroll",
    on: ["failedSave", "isMissed"],
    mode: "hard",
    selfTrigger: true,
    if: { "self.isTrigger": true },
    do: [{ step: "reroll", keep: "new" }, { step: "spendUses", amount: 1 }]
  }),
  {
    id: "sanctuary",
    match: { effects: [/^sanctuary$/i] },
    declarations: [{
      id: "sanctuary",
      label: "Sanctuary",
      rule: "combat.reaction.sanctuary",
      on: "isAttacked",
      mode: "passive",
      if: { "self.isTarget": true },
      do: [{ step: "ward", ability: "wis", dc: DC }]
    }]
  },
  feat("illusory-self", "Illusory Self", {
    on: "isHit",
    mode: "hard",
    if: { "self.isTarget": true },
    do: [{ step: "miss", to: "self" }, { step: "spendUses", amount: 1 }]
  }),
  feat("warding-flare", "Warding Flare", {
    on: "isAttacked",
    mode: "hard",
    range: 30,
    if: { "self.isTarget": true },
    do: [{ step: "disadvantage" }]
  }),
  feat("shield-master", "Shield Master", {
    on: ["savedSave", "failedSave"],
    mode: "hard",
    selfTrigger: true,
    if: { all: [{ "self.isTrigger": true }, { "self.wieldsShield": true }, { "activity.saveAbility": "dex" }] },
    do: [{ step: "evade" }]
  }),
  feat("mage-slayer", "Mage Slayer", {
    on: "castsSpell",
    mode: "soft",
    offer: "meleeWeapons",
    range: 5,
    if: { all: [NOT_FRIENDLY, { "activity.isSpell": true }] },
    do: []
  }),
  feat("mage-slayer-focus", "Mage Slayer", {
    id: "mage-slayer-focus",
    on: "isDamaged",
    mode: "passive",
    range: 5,
    if: { all: [{ "self.isTrigger": true }, NOT_FRIENDLY] },
    do: [{ step: "setFlag", to: "damaged", key: "concentrationDisadvantage" }]
  }),
  spell("circle-of-power", "Circle of Power", {
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{
      step: "applyEffect",
      to: "nearby",
      feet: 30,
      limit: 12,
      allies: true,
      effect: {
        name: "Circle of Power",
        duration: { rounds: 100 },
        flags: { "illusive-dnd-5e": { circleOfPower: true } }
      }
    }]
  }),
  feat("portent", "Portent", {
    on: "rest",
    if: { "self.isTrigger": true },
    do: [{ step: "portent", mode: "store", dice: 2 }]
  }),
  feat("portent-replace", "Portent", {
    id: "portent-replace",
    on: ["attackDeclared", "isAttacked", "savedSave", "failedSave"],
    mode: "hard",
    selfTrigger: true,
    do: [{ step: "portent", mode: "replace" }]
  }),
  feat("greater-portent", "Greater Portent", {
    on: "rest",
    if: { "self.isTrigger": true },
    do: [{ step: "portent", mode: "store", dice: 3, flag: "greaterPortent" }]
  }),
  feat("greater-portent-replace", "Greater Portent", {
    id: "greater-portent-replace",
    on: ["attackDeclared", "isAttacked", "savedSave", "failedSave"],
    mode: "hard",
    selfTrigger: true,
    do: [{ step: "portent", mode: "replace", flag: "greaterPortent" }]
  }),

  // ---- C1. Charm, fear, command, marks, ward ---------------------------
  ...["charm-person", "charm-monster", "dominate-person", "dominate-beast", "dominate-monster"].map((id) =>
    spell(id, id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), {
      on: "isDamaged",
      range: 120,
      if: { "trigger.statuses": { has: "charmed" } },
      do: [{ step: "save", to: "trigger", ability: "wis", dc: DC, endStatusOnSuccess: "charmed" }]
    })),
  ...["cause-fear", "fear"].map((id) => spell(id, id === "fear" ? "Fear" : "Cause Fear", {
    on: "isDamaged",
    range: 120,
    if: { "trigger.statuses": { has: "frightened" } },
    do: [{ step: "save", to: "trigger", ability: "wis", dc: DC, endStatusOnSuccess: "frightened" }]
  })),
  spell("command", "Command", {
    on: "isDamaged",
    range: 60,
    if: { "trigger.effects": { has: "command" } },
    do: [{ step: "save", to: "trigger", ability: "wis", dc: DC, endOnSuccess: "Command" }]
  }),
  spell("compulsion", "Compulsion", {
    on: "isDamaged",
    range: 60,
    if: { "trigger.effects": { has: "compulsion" } },
    do: [{ step: "endEffect", to: "trigger", name: "Compulsion" }]
  }),
  spell("blindness-deafness", "Blindness/Deafness", {
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "save", to: "targets", ability: "con", dc: DC, onFail: "blinded" }]
  }),
  spell("contagion", "Contagion", {
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "save", to: "targets", ability: "con", dc: DC, onFail: "poisoned" }]
  }),
  spell("bestow-curse", "Bestow Curse", {
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "save", to: "targets", ability: "wis", dc: DC, onFail: "cursed" }]
  }),
  {
    id: "guiding-bolt-mark",
    match: { effects: [/^guiding bolt$/i] },
    declarations: [{
      id: "guiding-bolt-mark",
      label: "Guiding Bolt",
      rule: "combat.reaction.guiding-bolt-mark",
      on: "isHit",
      mode: "passive",
      if: { "self.isTarget": true },
      do: [{ step: "endEffect", to: "self", name: "Guiding Bolt" }]
    }]
  },
  {
    id: "faerie-fire-mark",
    match: { effects: [/^faerie fire$/i] },
    declarations: [{
      id: "faerie-fire-mark",
      label: "Faerie Fire",
      rule: "combat.reaction.faerie-fire-mark",
      on: "isHit",
      mode: "passive",
      if: { "self.isTarget": true },
      do: [{ step: "endEffect", to: "self", name: "Faerie Fire" }]
    }]
  },
  spell("blade-ward", "Blade Ward", {
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{
      step: "resistEffect",
      to: "self",
      types: ["bludgeoning", "piercing", "slashing"],
      until: "turnEnd"
    }]
  }),

  // ---- C2. Zones the existing step can place ---------------------------
  zone("spike-growth", "Spike Growth", {
    feet: 20, when: "enter", difficult: true, damage: "2d4", damageType: "piercing", onSave: "full"
  }),
  zone("cloudkill", "Cloudkill", {
    feet: 20, when: "enterOrTurn", ability: "con", damage: "5d8", damageType: "poison", onSave: "half"
  }),
  zone("stinking-cloud", "Stinking Cloud", {
    feet: 20, when: "enter", ability: "con", onFail: "poisoned"
  }),
  zone("hunger-of-hadar", "Hunger of Hadar", {
    feet: 20, when: "enterOrTurn", damage: "2d6", damageType: "cold", onSave: "full", difficult: true
  }),
  zone("insect-plague", "Insect Plague", {
    feet: 20, when: "enterOrTurn", ability: "con", damage: "4d10", damageType: "piercing", onSave: "half"
  }),
  zone("cloud-of-daggers", "Cloud of Daggers", {
    feet: 5, when: "enterOrTurn", damage: "4d4", damageType: "slashing", onSave: "full"
  }),
  zone("wall-of-fire", "Wall of Fire", {
    feet: 10, when: "enter", ability: "dex", damage: "5d8", damageType: "fire", onSave: "half"
  }),
  zone("entangle", "Entangle", {
    feet: 20, when: "enter", ability: "str", onFail: "restrained", difficult: true
  }),
  zone("grease", "Grease", {
    feet: 10, when: "enter", ability: "dex", onFail: "prone"
  }),
  zone("evards-black-tentacles", "Evard's Black Tentacles", {
    feet: 20, when: "enter", ability: "dex", onFail: "restrained", damage: "3d6", damageType: "bludgeoning", onSave: "none"
  }),
  zone("sleet-storm", "Sleet Storm", {
    feet: 40, when: "enter", ability: "dex", onFail: "prone", difficult: true
  }),

  // ---- C2. Control the existing step can express -----------------------
  spell("hideous-laughter", "Tasha's Hideous Laughter", {
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "save", to: "targets", ability: "wis", dc: DC, onFail: "incapacitated" }]
  }),
  spell("hold-person", "Hold Person", {
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "save", to: "targets", ability: "wis", dc: DC, onFail: "paralyzed" }]
  }),
  spell("hold-monster", "Hold Monster", {
    on: "castsSpell",
    if: { "activity.isSource": true },
    do: [{ step: "save", to: "targets", ability: "wis", dc: DC, onFail: "paralyzed" }]
  }),
  // ---- C3. Feats --------------------------------------------------------
  feat("crusher", "Crusher", {
    on: "isHit",
    once: "turn",
    if: { all: [{ "self.isTrigger": true }, { "damage.types": { has: "bludgeoning" } }] },
    do: [{ step: "push", to: "target", feet: 5 }]
  }),
  feat("slasher", "Slasher", {
    on: "isHit",
    once: "turn",
    if: { all: [{ "self.isTrigger": true }, { "damage.types": { has: "slashing" } }] },
    do: [{ step: "applyEffect", to: "target", effect: { ...HALTED, name: "Slashed" } }]
  }),
  feat("grappler", "Grappler", {
    on: "isHit",
    mode: "soft",
    if: { all: [{ "self.isTrigger": true }, { "activity.isMelee": true }] },
    do: [{ step: "grapple", to: "target" }]
  }),
  feat("charger", "Charger", {
    on: "attackDeclared",
    mode: "soft",
    selfTrigger: true,
    if: { "self.isTrigger": true },
    do: [{ step: "attackBonus", value: "@prof" }, { step: "push", to: "target", feet: 10 }]
  }),
  feat("tavern-brawler", "Tavern Brawler", {
    on: "isHit",
    mode: "soft",
    if: { all: [{ "self.isTrigger": true }, { "damage.types": { has: "bludgeoning" } }] },
    do: [{ step: "push", to: "target", feet: 5 }]
  }),
  feat("defense", "Defense", {
    on: "attackDeclared",
    if: { "self.isTarget": true },
    do: [{ step: "acBonus", to: "self", value: 1 }]
  }),
  {
    id: "dueling",
    match: { identifiers: ["dueling"], names: names("Dueling") },
    declarations: [{
      id: "dueling",
      label: "Dueling",
      rule: "combat.rider.dueling",
      on: "hitDamage",
      rider: { auto: true, passive: true, formula: "2", oncePerTurn: false },
      do: [{ step: "bonusDamage", to: "target", value: 2 }]
    }]
  },

  // ---- C4. Class features ----------------------------------------------
  feat("action-surge", "Action Surge", {
    on: "usesFeature",
    if: { all: [{ "activity.isSource": true }, { not: { "activity.activation": "action" } }] },
    do: [{ step: "grantAction" }, { step: "spendUses", amount: 1 }]
  }),
  feat("indomitable", "Indomitable", {
    on: "failedSave",
    mode: "hard",
    selfTrigger: true,
    if: { "self.isTrigger": true },
    do: [{ step: "reroll", keep: "new" }, { step: "spendUses", amount: 1 }]
  }),
  feat("stunning-strike", "Stunning Strike", {
    on: "isHit",
    mode: "soft",
    if: { all: [{ "self.isTrigger": true }, { "activity.isMelee": true }] },
    do: [
      { step: "spendUses", amount: 1 },
      { step: "save", to: "target", ability: "con", dc: "8 + @abilities.wis.mod + @prof", onFail: "stunned" }
    ]
  }),
  feat("assassinate", "Assassinate", {
    on: "attackDeclared",
    if: { all: [{ "self.isTrigger": true }, { "relation.targetSurprised": true }] },
    do: [{ step: "advantage" }]
  }),
  feat("steady-aim", "Steady Aim", {
    on: "attackDeclared",
    mode: "soft",
    selfTrigger: true,
    if: { "self.isTrigger": true },
    do: [{ step: "advantage" }, { step: "control", deny: ["move"] }]
  }),
  feat("arcane-ward", "Arcane Ward", {
    on: "rest",
    if: { "self.isTrigger": true },
    do: [{ step: "tempHp", to: "self", value: "@classes.wizard.levels * 2 + @abilities.int.mod" }]
  }),
  feat("projected-ward", "Projected Ward", {
    on: "isHit",
    mode: "hard",
    range: 30,
    if: { "relation.targetAlly": true },
    do: [{ step: "intercept" }]
  }),
  ...["subtle", "distant", "extended", "careful", "empowered", "quickened", "heightened", "twinned"].map((option) =>
    feat(`${option}-spell`, `${option[0].toUpperCase()}${option.slice(1)} Spell`, {
      on: "castsSpell",
      mode: "soft",
      selfTrigger: true,
      if: { all: [{ "self.isTrigger": true }, { "activity.isSpell": true }] },
      do: [{ step: "metamagic", option }]
    })),

  // ---- C5. Auras and a few monster traits -------------------------------
  {
    id: "aura-of-warding",
    match: { identifiers: ["aura-of-warding"], names: names("Aura of Warding") },
    declarations: [{
      id: "aura-of-warding",
      label: "Aura of Warding",
      rule: "combat.aura.aura-of-warding",
      on: "aura",
      aura: { affects: "ally", defaultFeet: 10, effectName: "Aura of Warding" },
      do: [{ step: "note", text: "Aura of Warding" }]
    }]
  },
  {
    id: "aura-of-conquest",
    match: { identifiers: ["aura-of-conquest"], names: names("Aura of Conquest") },
    declarations: [{
      id: "aura-of-conquest",
      label: "Aura of Conquest",
      rule: "combat.aura.aura-of-conquest",
      on: "aura",
      aura: { affects: "enemy", defaultFeet: 10, effectName: "Aura of Conquest" },
      do: [{ step: "note", text: "Aura of Conquest" }]
    }]
  },

  // ---- C4. Maneuvers and strikes the step library can perform ----------
  feat("pushing-attack", "Pushing Attack", {
    on: "isHit",
    mode: "soft",
    if: { "self.isTrigger": true },
    do: [{ step: "spendUses", amount: 1, item: "superiority" }, { step: "push", to: "target", feet: 15 }]
  }),
  feat("menacing-attack", "Menacing Attack", {
    on: "isHit",
    mode: "soft",
    if: { "self.isTrigger": true },
    do: [
      { step: "spendUses", amount: 1, item: "superiority" },
      { step: "save", to: "target", ability: "wis", dc: "8 + @abilities.str.mod + @prof", onFail: "frightened" }
    ]
  }),
  feat("goading-attack", "Goading Attack", {
    on: "isHit",
    mode: "soft",
    if: { "self.isTrigger": true },
    do: [{ step: "spendUses", amount: 1, item: "superiority" }, { step: "lingeringDisadvantage" }]
  }),
  feat("tripping-attack", "Tripping Attack", {
    on: "isHit",
    mode: "soft",
    if: { "self.isTrigger": true },
    do: [
      { step: "spendUses", amount: 1, item: "superiority" },
      { step: "save", to: "target", ability: "str", dc: "8 + @abilities.str.mod + @prof", onFail: "prone" }
    ]
  }),
  feat("precision-attack", "Precision Attack", {
    on: "attackDeclared",
    mode: "soft",
    selfTrigger: true,
    if: { "self.isTrigger": true },
    do: [{ step: "spendUses", amount: 1, item: "superiority" }, { step: "attackBonus", value: "@superiorityDie" }]
  }),
  feat("rally", "Rally", {
    on: "usesFeature",
    if: { "activity.isSource": true },
    do: [{ step: "tempHp", to: "ally", value: "@superiorityDie + @abilities.cha.mod" }]
  }),
  feat("evasive-footwork", "Evasive Footwork", {
    on: "usesFeature",
    if: { "activity.isSource": true },
    do: [{ step: "acBonus", to: "self", value: "@superiorityDie" }]
  }),
  feat("distracting-strike", "Distracting Strike", {
    on: "isHit",
    mode: "soft",
    if: { "self.isTrigger": true },
    do: [{ step: "spendUses", amount: 1, item: "superiority" }, { step: "grantAdvantage", to: "ally" }]
  }),
  feat("feinting-attack", "Feinting Attack", {
    on: "attackDeclared",
    mode: "soft",
    selfTrigger: true,
    if: { "self.isTrigger": true },
    do: [{ step: "spendUses", amount: 1, item: "superiority" }, { step: "advantage" }]
  }),
  feat("sweeping-attack", "Sweeping Attack", {
    on: "isHit",
    mode: "soft",
    if: { "self.isTrigger": true },
    do: [{ step: "spendUses", amount: 1, item: "superiority" }, { step: "damage", to: "nearTarget", value: "@superiorityDie", damageType: "slashing" }]
  }),
  feat("open-hand-technique", "Open Hand Technique", {
    on: "isHit",
    mode: "soft",
    if: { all: [{ "self.isTrigger": true }, { "activity.isMelee": true }] },
    do: [{ step: "save", to: "target", ability: "dex", dc: "8 + @abilities.wis.mod + @prof", onFail: "prone" }]
  }),
  {
    id: "brutal-strike",
    match: { identifiers: ["brutal-strike"], names: names("Brutal Strike") },
    declarations: [{
      id: "brutal-strike",
      label: "Brutal Strike",
      rule: "combat.rider.brutal-strike",
      on: "hitDamage",
      rider: { auto: false, passive: false, formula: "1d10" },
      do: [{ step: "bonusDamage", to: "target", value: "1d10" }]
    }]
  }
]);
