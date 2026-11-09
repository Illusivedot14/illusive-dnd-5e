// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry, makeActor, makeCombatant, makeCombat } from "./helpers.mjs";
import { getCarouselLayout } from "../src/hud/components/turn-tracker/carousel-layout.mjs";
import { buildUnitData } from "../src/foundry/actor-data.mjs";
import {
  applyCarouselLayout,
  needsFullRebuild
} from "../src/hud/components/turn-tracker/turn-tracker-dom.mjs";

/** Six solo combatants A(60) B(50) C(40) D(30) E(20) F(10). */
function sixCombatants() {
  return ["A", "B", "C", "D", "E", "F"].map((name, i) =>
    makeCombatant({ id: name, name, initiative: 60 - i * 10, actor: makeActor({ isOwner: true }) })
  );
}

/**
 * Build the DOM that the rebuild path (Handlebars) would produce: one card per
 * combatant in initiative (insertion) order, plus the round separator.
 */
function buildTrackFromLayout(layout) {
  const track = document.createElement("div");
  track.id = "illusive-dnd-turn-tracker-track";

  for (const data of layout.combatants) {
    const card = document.createElement("div");
    card.className = "illusive-dnd-turn-card";
    card.dataset.combatantId = data.id;
    card.dataset.tokenId = data.tokenId ?? "";
    card.style.order = String(data.order);
    card.hidden = data.hidden;
    if (data.isActive) card.classList.add("is-active");

    const portrait = document.createElement("div");
    portrait.className = "illusive-dnd-turn-portrait";
    const img = document.createElement("img");
    img.className = "illusive-dnd-turn-portrait-img";
    img.alt = "";
    portrait.appendChild(img);
    const init = document.createElement("span");
    init.className = "illusive-dnd-turn-init";
    portrait.appendChild(init);
    const hp = document.createElement("span");
    hp.className = "illusive-dnd-turn-hp";
    portrait.appendChild(hp);
    card.appendChild(portrait);

    const name = document.createElement("div");
    name.className = "illusive-dnd-turn-name";
    card.appendChild(name);
    track.appendChild(card);
  }

  const sep = document.createElement("div");
  sep.className = "illusive-dnd-turn-separator";
  sep.style.order = String(layout.separatorOrder);
  const round = document.createElement("div");
  round.className = "illusive-dnd-turn-separator-round";
  const label = document.createElement("span");
  round.append(document.createElement("i"), label);
  sep.appendChild(round);
  track.appendChild(sep);

  document.body.appendChild(track);
  return track;
}

const activeCardId = (track) =>
  track.querySelector(".illusive-dnd-turn-card.is-active")?.dataset.combatantId ?? null;

const orderOf = (track, id) =>
  track.querySelector(`[data-combatant-id="${id}"]`)?.style.order ?? null;

describe("carousel turn advance (integration: real layout + DOM patch)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("moves the active highlight forward one combatant per turn", () => {
    const combatants = sixCombatants();
    const combat = makeCombat({ turn: 0, combatants });
    installFoundry({ isGM: true, combat });

    const layout0 = getCarouselLayout(combat, buildUnitData);
    const track = buildTrackFromLayout(layout0);
    expect(activeCardId(track)).toBe("A");

    combat.turn = 1;
    applyCarouselLayout(track, getCarouselLayout(combat, buildUnitData));
    expect(activeCardId(track)).toBe("B");

    combat.turn = 2;
    applyCarouselLayout(track, getCarouselLayout(combat, buildUnitData));
    expect(activeCardId(track)).toBe("C");
  });

  it("keeps the active card anchored to the front slot (order rotates) each turn", () => {
    const combatants = sixCombatants();
    const combat = makeCombat({ turn: 0, combatants });
    installFoundry({ isGM: true, combat });

    const track = buildTrackFromLayout(getCarouselLayout(combat, buildUnitData));
    // Active anchors the front slot (order 0).
    const frontOrder = orderOf(track, "A");
    expect(frontOrder).toBe("0");

    combat.turn = 1;
    applyCarouselLayout(track, getCarouselLayout(combat, buildUnitData));
    // Whoever is active should occupy the same front order slot A held at turn 0.
    expect(orderOf(track, "B")).toBe(frontOrder);
    expect(orderOf(track, "A")).not.toBe(frontOrder);
  });

  it("does NOT require a full rebuild on a plain turn advance", () => {
    const combatants = sixCombatants();
    const combat = makeCombat({ turn: 0, combatants });
    installFoundry({ isGM: true, combat });

    const track = buildTrackFromLayout(getCarouselLayout(combat, buildUnitData));
    combat.turn = 1;
    expect(needsFullRebuild(track, getCarouselLayout(combat, buildUnitData))).toBe(false);
  });

  it("advances correctly across several turns", () => {
    const combatants = sixCombatants();
    const combat = makeCombat({ turn: 0, combatants });
    installFoundry({ isGM: true, combat });

    const track = buildTrackFromLayout(getCarouselLayout(combat, buildUnitData));
    expect(activeCardId(track)).toBe("A");

    combat.turn = 3;
    applyCarouselLayout(track, getCarouselLayout(combat, buildUnitData));
    expect(activeCardId(track)).toBe("D");
  });
});
