/**
 * Stable rule IDs, source citations, edition/errata metadata.
 */

export const RULES = Object.freeze({
  "combat.activity-use": {
    id: "combat.activity-use",
    name: "Use activity",
    edition: "system",
    source: { book: "D&D 5e system", section: "Item activity use", page: null, locator: null },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Delegates rolls to dnd5e; Illusive owns workflow + explanation."
  },
  "combat.save-activity": {
    id: "combat.save-activity",
    name: "Save activity (damage + effects)",
    edition: "system",
    source: {
      book: "D&D 5e system",
      section: "SaveActivity — damage.onSave / effects.onSave",
      page: null,
      locator: null
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "DAS-style: roll saves vs DC → scale damage (none/half/full) → apply effect profiles by save outcome."
  },
  "combat.economy.action": {
    id: "combat.economy.action",
    name: "Action (economy)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Combat — Actions",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "flags.illusive-dnd-5e.actions"
  },
  "combat.economy.bonus": {
    id: "combat.economy.bonus",
    name: "Bonus Action (economy)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Bonus Actions",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "flags.illusive-dnd-5e.actions"
  },
  "combat.economy.reaction": {
    id: "combat.economy.reaction",
    name: "Reaction (economy)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Reactions",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Spend + hard/soft reaction windows (docs/combat-engine.md)"
  },
  "combat.reaction.shield": {
    id: "combat.reaction.shield",
    name: "Shield (reaction)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Spells — Shield",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Hard on-attack-hit; acBonus +5 then re-check hit"
  },
  "combat.reaction.counterspell": {
    id: "combat.reaction.counterspell",
    name: "Counterspell (reaction)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Spells — Counterspell",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Hard on-cast, 60 ft + sight. 2024: caster Con save vs reactor DC; on fail the spell is lost, action spent, slot refunded. 2014: auto ≤ the slot level Counterspell was cast with (HUD slot picker, min 3rd), else check DC 10 + level"
  },
  "combat.reaction.hellish-rebuke": {
    id: "combat.reaction.hellish-rebuke",
    name: "Hellish Rebuke (reaction)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Spells — Hellish Rebuke",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Soft after-damage-applied, 60 ft + sight; linked to the parent for log/undo"
  },
  "combat.reaction.uncanny-dodge": {
    id: "combat.reaction.uncanny-dodge",
    name: "Uncanny Dodge (reaction)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Class Features — Uncanny Dodge",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Hard on-damage-known; attack roll by a seen attacker; halves the whole hit (riders included)"
  },
  "combat.reaction.absorb-elements": {
    id: "combat.reaction.absorb-elements",
    name: "Absorb Elements (reaction)",
    edition: "2014",
    source: {
      book: "Xanathar's Guide to Everything",
      section: "Spells — Absorb Elements",
      page: null,
      locator: null
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Hard on-damage-known (attacks and saves); resistance to the triggering elemental types only; skipped if already resistant. Next-turn rider: the first melee hit on the reactor's next turn adds 1d6 per slot level of the absorbed type"
  },
  "combat.reaction.deflect": {
    id: "combat.reaction.deflect",
    name: "Deflect Missiles / Attacks / Energy",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Class Features — Deflect Attacks",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Hard on-damage-known; reduce 1d10 + Dex + Monk level. 2014 Missiles: ranged weapon attacks. 2024 Attacks: B/P/S attacks. Energy: any attack damage"
  },
  "combat.reaction.silvery-barbs": {
    id: "combat.reaction.silvery-barbs",
    name: "Silvery Barbs (reaction)",
    edition: "2014",
    source: {
      book: "Strixhaven: A Curriculum of Chaos",
      section: "Spells — Silvery Barbs",
      page: null,
      locator: null
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Hard on-attack-hit / on-save-success / on-check-success, 60 ft + sight; the creature rerolls and keeps the lower roll. Advantage on the next attack, check, or save (1 minute) goes to the reactor's first target other than the trigger, else the reactor"
  },
  "combat.reaction.parry": {
    id: "combat.reaction.parry",
    name: "Parry (monster reaction)",
    edition: "2024",
    source: {
      book: "Monster Manual (2024)",
      section: "Stat blocks — Parry",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/mm-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Hard on-attack-hit vs melee attacks on the reactor; AC bonus read from \"adds N to its AC\", else proficiency bonus; that attack only"
  },
  "combat.reaction.protection": {
    id: "combat.reaction.protection",
    name: "Protection (fighting style)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Feats — Protection",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "partial",
    notes: "Hard on-attack-declared: an ally within 5 ft is attacked by a seen hostile while the reactor holds a shield; disadvantage on that attack. 2024 lingering disadvantage until the reactor's next turn: manual"
  },
  "combat.reaction.interception": {
    id: "combat.reaction.interception",
    name: "Interception (fighting style)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Feats — Interception",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Hard on-damage-known: an ally within 5 ft hit by a seen hostile's attack; reduce 1d10 + proficiency bonus"
  },
  "combat.reaction.countercharm": {
    id: "combat.reaction.countercharm",
    name: "Countercharm (2024 reaction)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Class Features — Countercharm",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Hard on-save-fail, 30 ft, self or ally, vs effects applying Charmed/Frightened; reroll with advantage and keep the new roll. 2014 Countercharm (an action) is not matched"
  },
  "combat.reaction.stones-endurance": {
    id: "combat.reaction.stones-endurance",
    name: "Stone's Endurance",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Species — Goliath",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Hard on-damage-known; reduce 1d12 + Con modifier"
  },
  "combat.reaction.superior-hunters-defense": {
    id: "combat.reaction.superior-hunters-defense",
    name: "Superior Hunter's Defense (2024)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Class Features — Hunter",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Hard on-damage-known; resistance to the triggering types for this hit plus an effect until the current turn ends (currentTurnEnd)"
  },
  "combat.reaction.feather-fall": {
    id: "combat.reaction.feather-fall",
    name: "Feather Fall (reaction)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Spells — Feather Fall",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "partial",
    notes: "Detached hard on-fall (dnd5e plummet), 60 ft + sight, self or other; no fall damage and no prone. The faller only; extra creatures: manual"
  },
  "combat.reaction.slow-fall": {
    id: "combat.reaction.slow-fall",
    name: "Slow Fall (Monk)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Class Features — Slow Fall",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Detached hard on-fall, self only; reduce fall damage by 5 × Monk level; prone only if damage remains"
  },
  "combat.reaction.storms-thunder": {
    id: "combat.reaction.storms-thunder",
    name: "Storm's Thunder (Goliath)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Species — Goliath",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Soft after-damage-applied, 60 ft; uses the feature's own damage activity"
  },
  "combat.reaction.wrath-of-the-storm": {
    id: "combat.reaction.wrath-of-the-storm",
    name: "Wrath of the Storm (Tempest)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Class Features — Tempest Domain",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Soft after-damage-applied, 5 ft + sight, attack hits only; uses the feature's own save activity"
  },
  "combat.reaction.retaliation": {
    id: "combat.reaction.retaliation",
    name: "Retaliation (Berserker)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Class Features — Path of the Berserker",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Soft after-damage-applied, attacker within 5 ft; offers the reactor's equipped melee weapon attacks"
  },
  "combat.reaction.riposte": {
    id: "combat.reaction.riposte",
    name: "Riposte (Battle Master)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Class Features — Battle Master Maneuvers",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Soft on-attack-miss vs melee misses within 5 ft; offers melee weapon attacks, spends a superiority die, adds the die to that attack's damage on a hit"
  },
  "combat.action.ready": {
    id: "combat.action.ready",
    name: "Ready",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Actions — Ready",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "partial",
    notes: "Pick a trigger (hostile moves within range / casts / attacks) and an activity; a soft reaction prompt offers it when the trigger fires; lapses at the readier's next turn start. A readied spell spends its slot on release (no concentration hold)"
  },
  "combat.reaction.cutting-words": {
    id: "combat.reaction.cutting-words",
    name: "Cutting Words (reaction)",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Class Features — Cutting Words",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Hard on-attack-hit, 60 ft + sight; subtract the Bardic Inspiration die from the attack (a natural 20 still hits)"
  },
  "combat.range.check": {
    id: "combat.range.check",
    name: "Activity range gate",
    edition: "convenience",
    source: { book: "Foundry grid", section: "Token distance", page: null, locator: null },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Closest-square + elevation; melee reach vs ranged normal/long/thrown; long band allowed; cover gate separate."
  },
  "combat.opportunity-attack.2024": {
    id: "combat.opportunity-attack.2024",
    name: "Opportunity Attacks",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Rules Glossary — Opportunity Attacks",
      page: 371,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: true, version: "PHB-2024_v1" },
    automation: "full",
    notes: "Leave reach → reaction melee; Disengage / teleport / forced movement cancel"
  },
  "combat.opportunity-attack.2014": {
    id: "combat.opportunity-attack.2014",
    name: "Opportunity Attacks",
    edition: "2014",
    source: {
      book: "Player's Handbook (2014)",
      section: "Combat — Opportunity Attacks",
      page: 195,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2014"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Leave reach → reaction melee; must see the mover"
  },
  "combat.cover.2024": {
    id: "combat.cover.2024",
    name: "Cover",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Rules Glossary — Cover",
      page: 363,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: true, version: "PHB-2024_v1" },
    automation: "full",
    notes: "half +2 / three-quarters +5 AC & Dex saves; total blocks targeting"
  },
  "combat.cover.2014": {
    id: "combat.cover.2014",
    name: "Cover",
    edition: "2014",
    source: {
      book: "Player's Handbook (2014)",
      section: "Combat — Cover",
      page: 196,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2014"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Same bonus matrix as 2024; sampled wall rays → level"
  },
  "combat.correction": {
    id: "combat.correction",
    name: "GM correction / scoped undo",
    edition: "convenience",
    source: { book: null, section: null, page: null, locator: null },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Reverses appliedChanges (HP, effects, knockout, flags) via applyUndoPlan"
  },
  // Alias for older traces / docs
  "combat.correction.stub": {
    id: "combat.correction",
    name: "GM correction / scoped undo",
    edition: "convenience",
    source: { book: null, section: null, page: null, locator: null },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Alias of combat.correction"
  },
  "combat.grapple.2024": {
    id: "combat.grapple.2024",
    name: "Grappling",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Rules Glossary — Grappling",
      page: 367,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: true, version: "PHB-2024_v1" },
    automation: "reference-only",
    notes: "Unarmed Strike → save vs Grapple DC. Not auto-resolved in v1."
  },
  "combat.grapple.2014": {
    id: "combat.grapple.2014",
    name: "Grappling",
    edition: "2014",
    source: {
      book: "Player's Handbook (2014)",
      section: "Contests in Combat — Grappling",
      page: 195,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2014"
    },
    errata: { checked: false, version: null },
    automation: "reference-only",
    notes: "2014 / Legacy — Athletics contest. Not auto-resolved in v1."
  },
  "movement.path": {
    id: "movement.path",
    name: "Pathfinding",
    edition: "convenience",
    source: { book: "Foundry grid", section: "Token movement", page: null, locator: null },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "A* over normalized blocked cells"
  },
  "vision.evaluate": {
    id: "vision.evaluate",
    name: "Visibility check",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Vision and Lighting / Hide",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: true, version: "PHB-2024_v1" },
    automation: "full",
    notes: "Uses LOS + lighting + senses factors; indeterminate when facts missing"
  },
  "lighting.evaluate": {
    id: "lighting.evaluate",
    name: "Lighting at point",
    edition: "convenience",
    source: { book: "Foundry lights", section: "Ambient + token lights", page: null, locator: null },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Single owner; vision consumes result"
  },
  "loot.transfer": {
    id: "loot.transfer",
    name: "Transfer item",
    edition: "convenience",
    source: { book: "Foundry documents", section: "Embedded Item", page: null, locator: null },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Validate then inventory adapter"
  },
  "combat.triggers": {
    id: "combat.triggers",
    name: "Declared triggers",
    edition: "convenience",
    source: { book: "Illusive D&D 5e", section: "Trigger declarations", page: null, locator: null },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Moment + condition + steps as data; writes journaled for undo"
  },
  "combat.trigger.blur": {
    id: "combat.trigger.blur",
    name: "Blur",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Spells — Blur",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "full",
    notes: "Passive attackDeclared; disadvantage unless the attacker has Blindsight or Truesight"
  },
  "combat.trigger.protection-from-evil-and-good": {
    id: "combat.trigger.protection-from-evil-and-good",
    name: "Protection from Evil and Good",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Spells — Protection from Evil and Good",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "partial",
    notes: "Passive attackDeclared disadvantage from listed creature types; charm/fright/possession immunity not automated"
  },
  "combat.trigger.armor-of-agathys": {
    id: "combat.trigger.armor-of-agathys",
    name: "Armor of Agathys",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Spells — Armor of Agathys",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "partial",
    notes: "Passive isHit; 5 cold per slot level to a melee attacker while temp HP remain; effect does not end itself at 0 temp HP"
  },
  "combat.trigger.heavy-armor-master": {
    id: "combat.trigger.heavy-armor-master",
    name: "Heavy Armor Master",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Feats — Heavy Armor Master",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "partial",
    notes: "Passive damageKnown; 2024 reduces B/P/S from attacks by PB, 2014 by 3 from weapons (non-magical check not automated)"
  },
  "combat.trigger.dark-ones-blessing": {
    id: "combat.trigger.dark-ones-blessing",
    name: "Dark One's Blessing",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Warlock — Fiend Patron",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "partial",
    notes: "Passive isDamaged; temp HP when the warlock drops a hostile creature to 0 (2024 'enemy within 10 ft' wording not range-checked)"
  },
  "combat.trigger.defensive-duelist": {
    id: "combat.trigger.defensive-duelist",
    name: "Defensive Duelist",
    edition: "2024",
    source: {
      book: "Player's Handbook (2024)",
      section: "Feats — Defensive Duelist",
      page: null,
      locator: "https://www.dndbeyond.com/sources/dnd/phb-2024"
    },
    errata: { checked: false, version: null },
    automation: "partial",
    notes: "Hard isHit reaction; +PB AC against a melee hit while wielding a Finesse weapon (lasts for that attack only)"
  }
});

export function getRule(id) {
  return RULES[id] ?? null;
}

export function listRules({ edition = null, automation = null } = {}) {
  return Object.values(RULES).filter((rule) => {
    if (edition && rule.edition !== edition) return false;
    if (automation && rule.automation !== automation) return false;
    return true;
  });
}
