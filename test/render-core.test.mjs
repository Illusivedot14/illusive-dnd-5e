import { describe, it, expect, beforeEach, vi } from "vitest";

// core.mjs iterates panels from the registry and touches the member cache /
// overlay helpers. Stub those leaf modules so we can assert paint scheduling.
const { panels } = vi.hoisted(() => ({ panels: [] }));

vi.mock("../src/hud/lib/render/registry.mjs", () => ({
  getHudPanels: () => panels
}));
vi.mock("../src/hud/lib/hud-mount.mjs", () => ({
  removeHudOverlayIfEmpty: vi.fn()
}));
vi.mock("../src/hud/lib/render/member-cache.mjs", () => ({
  beginMemberCache: vi.fn(),
  endMemberCache: vi.fn()
}));

import { refreshHud } from "../src/hud/lib/render/core.mjs";
import { ILLUSIVE_DND_RENDER } from "../src/hud/lib/render/scopes.mjs";

function fakePanel(mask) {
  return { id: mask, mask, paint: vi.fn(async () => {}), position: vi.fn() };
}

describe("refreshHud pipeline", () => {
  beforeEach(() => {
    panels.length = 0;
  });

  it("paints the last-registered turn panel even when a non-turn scope is queued after it", async () => {
    // Production paint order: turn tracker is registered LAST.
    const party = fakePanel("party");
    const actionBar = fakePanel("actionBar");
    const turn = fakePanel("turn");
    panels.push(party, actionBar, turn);

    // A turn advance fans out into COMBAT_TURN (has turn) then SELECTION (no turn)
    // in the same tick. The turn panel must still repaint — this is the carousel
    // "doesn't rotate" regression.
    refreshHud(ILLUSIVE_DND_RENDER.COMBAT_TURN, { reposition: true });
    await refreshHud(ILLUSIVE_DND_RENDER.SELECTION);

    expect(turn.paint).toHaveBeenCalledTimes(1);
    expect(party.paint).toHaveBeenCalledTimes(1);
  });

  it("coalesces multiple same-tick refreshes into a single pass", async () => {
    const turn = fakePanel("turn");
    panels.push(turn);

    refreshHud(ILLUSIVE_DND_RENDER.TURN);
    refreshHud(ILLUSIVE_DND_RENDER.TURN);
    await refreshHud(ILLUSIVE_DND_RENDER.COMBAT_TURN);

    expect(turn.paint).toHaveBeenCalledTimes(1);
  });

  it("unions the mask so every requested panel is painted once", async () => {
    const party = fakePanel("party");
    const turn = fakePanel("turn");
    panels.push(party, turn);

    refreshHud(ILLUSIVE_DND_RENDER.PARTY);
    await refreshHud(ILLUSIVE_DND_RENDER.TURN);

    expect(party.paint).toHaveBeenCalledTimes(1);
    expect(turn.paint).toHaveBeenCalledTimes(1);
  });

  it("merges options across coalesced calls", async () => {
    const turn = fakePanel("turn");
    panels.push(turn);

    refreshHud(ILLUSIVE_DND_RENDER.TURN, { recenter: true });
    await refreshHud(ILLUSIVE_DND_RENDER.TURN, { reposition: true });

    expect(turn.paint).toHaveBeenCalledWith(
      expect.objectContaining({ recenter: true, reposition: true })
    );
  });

  it("does not paint panels whose mask is not requested", async () => {
    const party = fakePanel("party");
    const turn = fakePanel("turn");
    panels.push(party, turn);

    await refreshHud(ILLUSIVE_DND_RENDER.TURN);

    expect(turn.paint).toHaveBeenCalledTimes(1);
    expect(party.paint).not.toHaveBeenCalled();
  });
});
