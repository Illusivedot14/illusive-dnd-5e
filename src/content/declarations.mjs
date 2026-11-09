/**
 * Shipped rule declarations, keyed to dnd5e items or active effects.
 *
 * match.identifiers — item system.identifier on the listening creature
 * match.names       — item name fallback (imported content without identifiers)
 * match.effects     — active effect names on the listening creature (spells
 *                     cast on someone else: Protection from Evil and Good)
 *
 * Shape of each declaration: src/domain/triggers/declarations.mjs.
 * Citations: src/rules/catalog.mjs.
 */

const PHYSICAL = ["bludgeoning", "piercing", "slashing"];
const PFEG_TYPES = ["aberration", "celestial", "elemental", "fey", "fiend", "undead"];

export const CONTENT = Object.freeze([
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
            { "damage.types": { hasAny: PHYSICAL } }
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
          { "damaged.droppedHostile": { gt: 0 } }
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
]);
