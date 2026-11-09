# Weapon Masteries (dnd5e 5.3.3 / 2024 SRD)

Source: `CONFIG.DND5E.weaponMasteries` + `Compendium.dnd5e.equipment24` PHB weapons.

Status column is for Illusive implementation tracking.

| Key | Label | Effect (rules summary) | Status |
|---|---|---|---|
| `cleave` | Cleave | On a hit against a creature, make another melee attack vs a second creature within 5 ft of the first (if in reach). | done |
| `graze` | Graze | On a miss, deal ability-modifier damage of the weapon's type to the target. | done |
| `nick` | Nick | When you make the Light property extra attack, you can make it as part of the Attack action instead of a Bonus Action (once per turn). | done |
| `push` | Push | On a hit, push the target up to 10 feet away (Large or smaller) if you want. | done |
| `sap` | Sap | On a hit, the target has Disadvantage on its next attack roll before the start of your next turn. | done |
| `slow` | Slow | On a hit, reduce the target's Speed by 10 feet until the start of your next turn. | done |
| `topple` | Topple | On a hit, force a Con save (DC 8 + proficiency + ability mod) or the target is Prone. | done |
| `vex` | Vex | On a hit, you have Advantage on your next attack roll against that creature before the end of your next turn. | done |

## Weapons by mastery

### cleave

- **Greataxe** (`martialM`) — props: hvy, two
- **Halberd** (`martialM`) — props: hvy, rch, two

### graze

- **Glaive** (`martialM`) — props: hvy, rch, two
- **Greatsword** (`martialM`) — props: hvy, two

### nick

- **Dagger** (`simpleM`) — props: fin, lgt, thr
- **Light Hammer** (`simpleM`) — props: lgt, thr
- **Scimitar** (`martialM`) — props: fin, lgt
- **Sickle** (`simpleM`) — props: lgt

### push

- **Greatclub** (`simpleM`) — props: two
- **Heavy Crossbow** (`martialR`) — props: amm, hvy, lod, two
- **Pike** (`martialM`) — props: hvy, rch, two
- **Warhammer** (`martialM`) — props: ver

### sap

- **Flail** (`martialM`) — props: none
- **Longsword** (`martialM`) — props: ver
- **Mace** (`simpleM`) — props: none
- **Morningstar** (`martialM`) — props: none
- **Spear** (`simpleM`) — props: thr, ver
- **War Pick** (`martialM`) — props: ver

### slow

- **Club** (`simpleM`) — props: lgt
- **Javelin** (`simpleM`) — props: thr
- **Light Crossbow** (`simpleR`) — props: amm, lod, two
- **Longbow** (`martialR`) — props: amm, hvy, two
- **Musket** (`martialR`) — props: amm, lod, two
- **Sling** (`simpleR`) — props: amm
- **Whip** (`martialM`) — props: fin, rch

### topple

- **Battleaxe** (`martialM`) — props: ver
- **Lance** (`martialM`) — props: hvy, rch, two
- **Maul** (`martialM`) — props: hvy, two
- **Quarterstaff** (`simpleM`) — props: ver
- **Trident** (`martialM`) — props: thr, ver

### vex

- **Blowgun** (`martialR`) — props: amm, lod
- **Dart** (`simpleR`) — props: fin, thr
- **Hand Crossbow** (`martialR`) — props: amm, lgt, lod
- **Handaxe** (`simpleM`) — props: lgt, thr
- **Pistol** (`martialR`) — props: amm, lod
- **Rapier** (`martialM`) — props: fin
- **Shortbow** (`simpleR`) — props: amm, two
- **Shortsword** (`martialM`) — props: fin, lgt

## Machine-readable

- [reference/weapons24-phb.json](reference/weapons24-phb.json)
