// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { installFoundry, makeCombat, makeCardEl, makeTrackEl } from "./helpers.mjs";
import {
  updateTurnTrackerControls,
  needsFullRebuild,
  applyCarouselLayout
} from "../src/hud/components/turn-tracker/turn-tracker-dom.mjs";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("updateTurnTrackerControls", () => {
  function buildRoot() {
    const root = document.createElement("div");
    root.id = "illusive-dnd-turn-tracker";
    root.innerHTML = `
      <div data-illusive-dnd-controls="gm">
        <button data-action="start-combat"></button>
        <button data-action="end-combat"></button>
        <button data-illusive-dnd-encounter data-action="next-encounter"></button>
      </div>`;
    document.body.appendChild(root);
    return root;
  }

  it("shows End (hides Start) once combat has started", () => {
    installFoundry({ isGM: true, combat: makeCombat({ started: true }) });
    const root = buildRoot();
    updateTurnTrackerControls(makeCombat({ started: true }));
    expect(root.querySelector('[data-action="start-combat"]').hidden).toBe(true);
    expect(root.querySelector('[data-action="end-combat"]').hidden).toBe(false);
  });

  it("hides encounter buttons when there is only one encounter", () => {
    const combat = makeCombat({ started: true, sceneId: "scene1" });
    installFoundry({ isGM: true, combat, combats: [combat], scene: { id: "scene1" } });
    const root = buildRoot();
    updateTurnTrackerControls(combat);
    expect(root.querySelector("[data-illusive-dnd-encounter]").hidden).toBe(true);
  });

  it("shows encounter buttons with multiple scene encounters", () => {
    const c1 = makeCombat({ id: "c1", started: true, sceneId: "scene1" });
    const c2 = makeCombat({ id: "c2", started: true, sceneId: "scene1" });
    installFoundry({ isGM: true, combat: c1, combats: [c1, c2], scene: { id: "scene1" } });
    const root = buildRoot();
    updateTurnTrackerControls(c1);
    expect(root.querySelector("[data-illusive-dnd-encounter]").hidden).toBe(false);
  });

  it("hides GM control groups from players", () => {
    const combat = makeCombat({ started: true });
    installFoundry({ isGM: false, combat });
    const root = buildRoot();
    updateTurnTrackerControls(combat);
    expect(root.querySelector('[data-illusive-dnd-controls="gm"]').hidden).toBe(true);
  });
});

describe("needsFullRebuild", () => {
  beforeEach(() => installFoundry({ isGM: true }));

  it("is false when visible cards match the layout ids and order", () => {
    const track = makeTrackEl([makeCardEl({ id: "A" }), makeCardEl({ id: "B" })]);
    expect(needsFullRebuild(track, { combatantIds: ["A", "B"] })).toBe(false);
  });

  it("is true when the count differs", () => {
    const track = makeTrackEl([makeCardEl({ id: "A" })]);
    expect(needsFullRebuild(track, { combatantIds: ["A", "B"] })).toBe(true);
  });

  it("is true when the order differs", () => {
    const track = makeTrackEl([makeCardEl({ id: "A" }), makeCardEl({ id: "B" })]);
    expect(needsFullRebuild(track, { combatantIds: ["B", "A"] })).toBe(true);
  });

  it("ignores hidden cards", () => {
    const hidden = makeCardEl({ id: "H" });
    hidden.hidden = true;
    const track = makeTrackEl([makeCardEl({ id: "A" }), hidden]);
    expect(needsFullRebuild(track, { combatantIds: ["A"] })).toBe(false);
  });
});

describe("applyCarouselLayout", () => {
  beforeEach(() => installFoundry({ isGM: true, settings: { showTurnCardHpNumbers: true } }));

  function layoutFor(overrides = {}) {
    return {
      separatorOrder: 250,
      round: 3,
      combatants: [
        {
          id: "A",
          name: "Aragorn",
          order: 100,
          hidden: false,
          isActive: true,
          defeated: false,
          markedDefeated: false,
          secret: false,
          isEvent: false,
          isGroup: false,
          showHp: true,
          img: "a.png",
          canRollInitiative: false,
          hasRolled: true,
          initiative: 18,
          hp: { value: 8, max: 10, tier: "warn", totalPercent: 80 }
        }
      ],
      ...overrides
    };
  }

  it("patches the separator order and round text", () => {
    const track = makeTrackEl([makeCardEl({ id: "A" })], { separatorOrder: 0 });
    applyCarouselLayout(track, layoutFor());
    const separator = track.querySelector(".illusive-dnd-turn-separator");
    expect(separator.style.order).toBe("250");
    expect(separator.querySelector("span:last-child").textContent).toBe("3");
  });

  it("updates card order, active state, initiative, hp, and name", () => {
    const card = makeCardEl({ id: "A" });
    const track = makeTrackEl([card]);
    applyCarouselLayout(track, layoutFor());

    expect(card.style.order).toBe("100");
    expect(card.classList.contains("is-active")).toBe(true);
    expect(card.querySelector(".illusive-dnd-turn-init").textContent).toBe("18");
    expect(card.querySelector(".illusive-dnd-turn-hp").textContent).toBe("8/10");
    expect(card.querySelector(".illusive-dnd-turn-hp").hidden).toBe(false);
    expect(card.querySelector(".illusive-dnd-turn-name").textContent).toBe("Aragorn");
  });

  it("always shows the round number without a Round label", () => {
    const track = makeTrackEl([makeCardEl({ id: "A" })]);
    applyCarouselLayout(track, layoutFor({ round: 7 }));
    expect(track.querySelector(".illusive-dnd-turn-separator span:last-child").textContent).toBe("7");
  });

  it("updates HP numbers on patch", () => {
    const card = makeCardEl({ id: "A" });
    applyCarouselLayout(makeTrackEl([card]), layoutFor({
      combatants: [{
        ...layoutFor().combatants[0],
        hp: { value: 28, max: 100, tier: "critical", totalPercent: 28 }
      }]
    }));

    expect(card.querySelector(".illusive-dnd-turn-hp").textContent).toBe("28/100");
  });
});
