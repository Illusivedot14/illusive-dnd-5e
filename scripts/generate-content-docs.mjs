import fs from "fs";
import path from "path";

const dump = path.resolve("docs/_pack-dump");
const docs = path.resolve("docs");
const ref = path.join(docs, "reference");
fs.mkdirSync(ref, { recursive: true });

const spells24 = JSON.parse(fs.readFileSync(path.join(dump, "spells24.json"), "utf8"));
const spells14 = JSON.parse(fs.readFileSync(path.join(dump, "spells.json"), "utf8"));
const classFeatures = JSON.parse(fs.readFileSync(path.join(dump, "classes24-features.json"), "utf8"));
const grants = JSON.parse(fs.readFileSync(path.join(dump, "classes24-grants.json"), "utf8"));
const feats24 = JSON.parse(fs.readFileSync(path.join(dump, "feats24-clean.json"), "utf8"));
const origins = JSON.parse(fs.readFileSync(path.join(dump, "origins24-features.json"), "utf8"));
const weapons = JSON.parse(fs.readFileSync(path.join(dump, "weapons24-phb.json"), "utf8"));
const cf2014 = JSON.parse(fs.readFileSync(path.join(dump, "classfeatures.json"), "utf8"));
const mf24 = JSON.parse(fs.readFileSync(path.join(dump, "monsterfeatures24.json"), "utf8"));

const copies = [
  ["spells24.json", "spells24.json"],
  ["spells.json", "spells.json"],
  ["classes24-features.json", "classes24-features.json"],
  ["classes24-grants.json", "classes24-grants.json"],
  ["feats24-clean.json", "feats24.json"],
  ["origins24-features.json", "origins24-features.json"],
  ["weapons24-phb.json", "weapons24-phb.json"],
  ["classfeatures.json", "classfeatures.json"],
  ["monsterfeatures24.json", "monsterfeatures24.json"]
];
for (const [src, dest] of copies) {
  fs.copyFileSync(path.join(dump, src), path.join(ref, dest));
}

const LEVEL_NAMES = ["Cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
const SCHOOL = {
  abj: "Abjuration",
  con: "Conjuration",
  div: "Divination",
  enc: "Enchantment",
  evo: "Evocation",
  ill: "Illusion",
  nec: "Necromancy",
  trs: "Transmutation"
};

const masteryHints = {
  cleave: "On a hit against a creature, make another melee attack vs a second creature within 5 ft of the first (if in reach).",
  graze: "On a miss, deal ability-modifier damage of the weapon's type to the target.",
  nick: "When you make the Light property extra attack, you can make it as part of the Attack action instead of a Bonus Action (once per turn).",
  push: "On a hit, push the target up to 10 feet away (Large or smaller) if you want.",
  sap: "On a hit, the target has Disadvantage on its next attack roll before the start of your next turn.",
  slow: "On a hit, reduce the target's Speed by 10 feet until the start of your next turn.",
  topple: "On a hit, force a Con save (DC 8 + proficiency + ability mod) or the target is Prone.",
  vex: "On a hit, you have Advantage on your next attack roll against that creature before the end of your next turn."
};

function actSummary(acts = []) {
  if (!acts.length) return "—";
  return [...new Set(acts.map((a) => a.type).filter(Boolean))].join(", ");
}

function mdEscape(s) {
  return String(s ?? "").replace(/\|/g, "\\|");
}

let masteryMd = `# Weapon Masteries (dnd5e 5.3.3 / 2024 SRD)

Source: \`CONFIG.DND5E.weaponMasteries\` + \`Compendium.dnd5e.equipment24\` PHB weapons.

Status column is for Illusive implementation tracking.

| Key | Label | Effect (rules summary) | Status |
|---|---|---|---|
`;
for (const key of Object.keys(masteryHints).sort()) {
  const label = key[0].toUpperCase() + key.slice(1);
  masteryMd += `| \`${key}\` | ${label} | ${masteryHints[key]} | todo |\n`;
}
masteryMd += `\n## Weapons by mastery\n\n`;
for (const key of Object.keys(masteryHints).sort()) {
  const list = weapons.filter((w) => w.mastery === key);
  masteryMd += `### ${key}\n\n`;
  if (!list.length) {
    masteryMd += "_No PHB weapons in pack with this mastery._\n\n";
    continue;
  }
  masteryMd += list
    .map((w) => `- **${w.name}** (\`${w.weaponType}\`) — props: ${(w.properties || []).join(", ") || "none"}`)
    .join("\n");
  masteryMd += "\n\n";
}
masteryMd += `## Machine-readable\n\n- [reference/weapons24-phb.json](reference/weapons24-phb.json)\n`;
fs.writeFileSync(path.join(docs, "weapon-masteries.md"), masteryMd);

let spellsMd = `# Spells — base Foundry dnd5e

Primary target: **2024 SRD** pack \`spells24\` (**${spells24.length}** spells).
Legacy: **2014 SRD** pack \`spells\` (**${spells14.length}** spells).

Illusive implements spell behavior on top of dnd5e activity data (attack / save / damage / heal / utility / summon / enchant). Status tracks Illusive-specific automation beyond vanilla activity use.

## 2024 counts by level

| Level | Count |
|---|---:|
`;
for (let i = 0; i <= 9; i++) {
  spellsMd += `| ${LEVEL_NAMES[i]} | ${spells24.filter((s) => s.level === i).length} |\n`;
}
spellsMd += `\n## 2024 spell list\n\n| Level | Name | School | Conc | Ritual | Activities | Pack ID | Status |\n|---|---|---|---|---|---|---|---|\n`;
for (const s of [...spells24].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))) {
  spellsMd += `| ${LEVEL_NAMES[s.level] ?? s.level} | ${mdEscape(s.name)} | ${SCHOOL[s.school] ?? s.school ?? "—"} | ${s.concentration ? "Y" : "—"} | ${s.ritual ? "Y" : "—"} | ${actSummary(s.activities)} | \`${s.id}\` | todo |\n`;
}
spellsMd += `\n## 2014 SRD spell list (legacy)\n\n| Level | Name | School | Pack ID | Status |\n|---|---|---|---|---|\n`;
for (const s of [...spells14].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))) {
  spellsMd += `| ${LEVEL_NAMES[s.level] ?? s.level} | ${mdEscape(s.name)} | ${SCHOOL[s.school] ?? s.school ?? "—"} | \`${s.id}\` | todo |\n`;
}
spellsMd += `\n## Machine-readable\n\n- [reference/spells24.json](reference/spells24.json)\n- [reference/spells.json](reference/spells.json) (2014)\n`;
fs.writeFileSync(path.join(docs, "spells.md"), spellsMd);

const owners = [...new Set(grants.map((g) => g.owner))];
let featMd = `# Features — base Foundry dnd5e

Covers **class/subclass features**, **feats / fighting styles / epic boons**, **species traits**, and **monster features**.

Primary: 2024 packs (\`classes24\`, \`feats24\`, \`origins24\`).
Legacy: 2014 \`classfeatures\` (${cf2014.length} items).

## Class & subclass features (2024)

${classFeatures.length} feature items in \`classes24\`; ${grants.length} advancement grants.

`;
for (const owner of owners.sort()) {
  const rows = grants.filter((g) => g.owner === owner);
  const type = rows[0]?.ownerType ?? "class";
  featMd += `### ${owner} (${type})\n\n`;
  featMd += `| Lvl | Feature | Optional | Feature ID | Status |\n|---:|---|---|---|---|\n`;
  for (const g of rows) {
    featMd += `| ${g.level ?? "—"} | ${mdEscape(g.featureName || g.grantTitle || g.featureId)} | ${g.optional ? "Y" : "—"} | \`${g.featureId}\` | todo |\n`;
  }
  featMd += "\n";
}

featMd += `## Feats / styles / boons (\`feats24\`)\n\n| Name | Kind | Identifier | Activities | Pack ID | Status |\n|---|---|---|---|---|---|\n`;
for (const f of feats24) {
  featMd += `| ${mdEscape(f.name)} | ${f.subtype || f.featureType || "feat"} | ${f.identifier || "—"} | ${actSummary(f.activities)} | \`${f.id}\` | todo |\n`;
}

featMd += `\n## Species / origin traits (\`origins24\`)\n\n| Name | Kind | Identifier | Activities | Pack ID | Status |\n|---|---|---|---|---|---|\n`;
for (const f of origins) {
  featMd += `| ${mdEscape(f.name)} | ${f.subtype || f.featureType || "race"} | ${f.identifier || "—"} | ${actSummary(f.activities)} | \`${f.id}\` | todo |\n`;
}

featMd += `\n## Monster features\n\n| Pack | Count | Notes |\n|---|---:|---|\n| \`monsterfeatures24\` | ${mf24.length} | 2024 monster traits/actions |\n| \`monsterfeatures\` | see pack | 2014 legacy |\n\nFull dump: [reference/monsterfeatures24.json](reference/monsterfeatures24.json)\n\n## 2014 class features (legacy)\n\n${cf2014.length} items in \`classfeatures\`. See [reference/classfeatures.json](reference/classfeatures.json).\n\n## Machine-readable\n\n- [reference/classes24-features.json](reference/classes24-features.json)\n- [reference/classes24-grants.json](reference/classes24-grants.json)\n- [reference/feats24.json](reference/feats24.json)\n- [reference/origins24-features.json](reference/origins24-features.json)\n`;
fs.writeFileSync(path.join(docs, "features.md"), featMd);

const hub = `# Content inventory — base Foundry dnd5e

Reference catalog of everything Illusive must eventually automate from the **stock dnd5e 5.3.3** system packs (no third-party modules).

Edition focus: **2024 SRD** (\`*24\` packs). 2014 SRD packs are listed as legacy.

## Sections

1. [Weapon Masteries](weapon-masteries.md) — 8 masteries + PHB weapon mapping
2. [Spells](spells.md) — ${spells24.length} (2024) + ${spells14.length} (2014)
3. [Features](features.md) — class/subclass, feats, species traits, monster features

## Counts (2024)

| Bucket | Count | Pack |
|---|---:|---|
| Weapon masteries | 8 | \`CONFIG.DND5E.weaponMasteries\` |
| PHB weapons w/ mastery | ${weapons.filter((w) => w.mastery).length} | \`equipment24\` |
| Spells | ${spells24.length} | \`spells24\` |
| Class/subclass feature items | ${classFeatures.length} | \`classes24\` |
| Advancement feature grants | ${grants.length} | \`classes24\` |
| Feats / styles / boons | ${feats24.length} | \`feats24\` |
| Species traits | ${origins.length} | \`origins24\` |
| Monster features | ${mf24.length} | \`monsterfeatures24\` |

## Status legend

| Status | Meaning |
|---|---|
| todo | Not yet Illusive-special-cased (may already work via generic activity automation) |
| partial | Some paths work |
| done | Illusive owns the full behavior |

## How to refresh

Re-dump LevelDB packs from \`Data/systems/dnd5e/packs\` (Foundry may lock files — copy without \`LOCK\` first), then regenerate these markdown files from \`docs/reference/*.json\` via \`node scripts/generate-content-docs.mjs\`.
`;
fs.writeFileSync(path.join(docs, "content-inventory.md"), hub);

console.log("Wrote:");
for (const f of ["content-inventory.md", "weapon-masteries.md", "spells.md", "features.md"]) {
  console.log(`- docs/${f} (${fs.statSync(path.join(docs, f)).size} bytes)`);
}
