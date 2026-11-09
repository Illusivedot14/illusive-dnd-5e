// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { installFoundry } from "./helpers.mjs";
import {
  sizeCarouselWindow,
  getMaxCards,
  measureControlExtents,
  ACTIVE_CARD_GLOW_CLEARANCE,
  CONTROL_GAP,
  CONTROL_GAP_RIGHT,
  TRACK_PADDING_INLINE
} from "../src/hud/components/turn-tracker/turn-tracker-window.mjs";
import { playTurnSlide, positionCarousel } from "../src/hud/components/turn-tracker/turn-tracker-motion.mjs";
import { positionTurnTracker, alignTurnTrackerToBand, getDockVisualRect } from "../src/hud/components/turn-tracker/turn-tracker-position.mjs";
import { bindCarouselScroll, updateCarouselScrollSlider, scrollFromSlider, sliderFromScroll } from "../src/hud/components/turn-tracker/turn-tracker-scroll.mjs";
import { getHudBand, computeHudFitScale, applyHudBandVariables } from "../src/hud/lib/hud-bounds.mjs";

function mountTrack({ active = false } = {}) {
  document.body.innerHTML = "";
  const track = document.createElement("div");
  track.id = "illusive-dnd-turn-tracker-track";
  track.scrollTo = vi.fn();
  if (active) {
    const card = document.createElement("div");
    card.className = "illusive-dnd-turn-card is-active";
    card.scrollIntoView = vi.fn();
    track.appendChild(card);
  }
  document.body.appendChild(track);
  return track;
}

describe("playTurnSlide", () => {
  it("adds the forward slide class when advancing", () => {
    installFoundry({ settings: { carouselTurnAnimation: true } });
    const track = mountTrack();
    playTurnSlide(1);
    expect(track.classList.contains("illusive-dnd-turn-sliding-fwd")).toBe(true);
    expect(track.classList.contains("illusive-dnd-turn-sliding-back")).toBe(false);
  });

  it("adds the backward slide class when going back", () => {
    installFoundry({ settings: { carouselTurnAnimation: true } });
    const track = mountTrack();
    playTurnSlide(-1);
    expect(track.classList.contains("illusive-dnd-turn-sliding-back")).toBe(true);
  });

  it("does nothing for a zero direction", () => {
    installFoundry({ settings: { carouselTurnAnimation: true } });
    const track = mountTrack();
    playTurnSlide(0);
    expect(track.classList.contains("illusive-dnd-turn-sliding-fwd")).toBe(false);
    expect(track.classList.contains("illusive-dnd-turn-sliding-back")).toBe(false);
  });

  it("does nothing when the animation setting is off", () => {
    installFoundry({ settings: { carouselTurnAnimation: false } });
    const track = mountTrack();
    playTurnSlide(1);
    expect(track.classList.contains("illusive-dnd-turn-sliding-fwd")).toBe(false);
  });

  it("clears the slide class on animationend", () => {
    installFoundry({ settings: { carouselTurnAnimation: true } });
    const track = mountTrack();
    playTurnSlide(1);
    track.dispatchEvent(new window.Event("animationend"));
    expect(track.classList.contains("illusive-dnd-turn-sliding-fwd")).toBe(false);
  });
});

describe("positionCarousel", () => {
  it("anchors the active card to the start (front slot)", () => {
    installFoundry();
    const track = mountTrack({ active: true });
    positionCarousel(false);
    expect(track.querySelector(".is-active").scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ inline: "start" })
    );
  });

  it("resets scroll to start when there is no active card", () => {
    installFoundry();
    const track = mountTrack({ active: false });
    positionCarousel(false);
    expect(track.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 0 }));
  });
});

function setViewport(width, height = Math.round(width * 9 / 16)) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

function stubRect(el, { left = 0, right = 0, height = 200 }) {
  const width = right - left;
  el.getBoundingClientRect = () => ({
    left, right, top: 0, bottom: height, width, height, x: left, y: 0
  });
}

function mountSideUi({ sidebarLeft, controlsRight = 50 }) {
  document.body.innerHTML = "";

  const sidebar = document.createElement("div");
  sidebar.id = "sidebar";
  stubRect(sidebar, { left: sidebarLeft, right: window.innerWidth });
  document.body.appendChild(sidebar);

  const controls = document.createElement("div");
  controls.id = "ui-left";
  stubRect(controls, { left: 0, right: controlsRight });
  document.body.appendChild(controls);
}

function mountTracker() {
  const root = document.createElement("div");
  root.id = "illusive-dnd-turn-tracker";
  document.body.appendChild(root);
  return root;
}

describe("getHudBand", () => {
  it("carves the sidebar and left controls out of the viewport", () => {
    setViewport(1600, 900);
    mountSideUi({ sidebarLeft: 1300, controlsRight: 60 });
    const band = getHudBand(10);
    expect(band.start).toBe(70);
    expect(band.end).toBe(1290);
    expect(band.width).toBe(1220);
    expect(band.center).toBe(680);
  });

  it("clamps an oversized left inset so the band stays centered-ish", () => {
    setViewport(1000, 562);
    mountSideUi({ sidebarLeft: 900, controlsRight: 600 });
    const band = getHudBand(0);
    // left inset capped at 20% of viewport (200px), not the reported 600px.
    expect(band.start).toBe(200);
  });
});

describe("computeHudFitScale", () => {
  it("uses the 1.5× landscape boost at the design reference, shrinks on a smaller display", () => {
    // Design ref is 2560×1440 landscape → factor 1 → scale 1.5
    setViewport(2560, 1440);
    mountSideUi({ sidebarLeft: 2300, controlsRight: 60 });
    expect(computeHudFitScale()).toBe(1.5);

    setViewport(1280, 720);
    mountSideUi({ sidebarLeft: 1100, controlsRight: 40 });
    const narrow = computeHudFitScale();
    expect(narrow).toBeLessThan(1.5);
    expect(narrow).toBeGreaterThanOrEqual(0.7);
  });

  it("publishes the fit scale onto --illusive-dnd-global-scale for the party rail", () => {
    setViewport(2560, 1440);
    mountSideUi({ sidebarLeft: 2300, controlsRight: 60 });
    applyHudBandVariables();
    expect(document.documentElement.style.getPropertyValue("--illusive-dnd-global-scale")).toBe("1.5");
    expect(document.documentElement.style.getPropertyValue("--illusive-dnd-hud-fit-scale")).toBe("1.5");
  });
});

describe("positionTurnTracker", () => {
  it("centers the tracker in the band and caps its scaled width to it", () => {
    setViewport(1600, 900);
    mountSideUi({ sidebarLeft: 1300, controlsRight: 60 });
    const root = mountTracker();

    positionTurnTracker();
    const band = getHudBand();
    const scale = parseFloat(root.style.getPropertyValue("--illusive-dnd-turn-scale"));
    const maxWidth = parseInt(root.style.maxWidth, 10);

    expect(root.style.left).toBe(`${Math.round(band.center)}px`);
    expect(scale).toBeGreaterThan(0);
    expect(maxWidth * scale).toBeLessThanOrEqual(band.width + 1);
  });

  it("sizes turn cards relative to the party rail and shrinks on a narrow display", () => {
    setViewport(2560, 1440);
    mountSideUi({ sidebarLeft: 2300, controlsRight: 60 });
    applyHudBandVariables();
    const wide = mountTracker();
    positionTurnTracker();
    const wideScale = parseFloat(wide.style.getPropertyValue("--illusive-dnd-turn-scale"));

    setViewport(1280, 720);
    mountSideUi({ sidebarLeft: 1100, controlsRight: 40 });
    applyHudBandVariables();
    const narrow = mountTracker();
    positionTurnTracker();
    const narrowScale = parseFloat(narrow.style.getPropertyValue("--illusive-dnd-turn-scale"));

    // Party-relative: layoutW × globalScale × 1.25 / cardW × combat chrome 1.15
    expect(wideScale).toBeCloseTo((62 * 1.5 * 1.25 / 88) * 1.15, 5);
    expect(narrowScale).toBeLessThan(wideScale);
    expect(narrowScale).toBeGreaterThanOrEqual(0.4);
  });

  it("leaves a hidden tracker untouched", () => {
    setViewport(1600, 900);
    mountSideUi({ sidebarLeft: 1300 });
    const root = mountTracker();
    root.classList.add("illusive-dnd-hidden");
    positionTurnTracker();
    expect(root.style.left).toBe("");
    expect(root.style.maxWidth).toBe("");
  });
});

function mountFullTracker(cardCount) {
  document.body.innerHTML = "";
  const root = document.createElement("div");
  root.id = "illusive-dnd-turn-tracker";
  const dock = document.createElement("div");
  dock.className = "illusive-dnd-turn-dock";
  const carousel = document.createElement("div");
  carousel.className = "illusive-dnd-turn-carousel";
  const track = document.createElement("div");
  track.id = "illusive-dnd-turn-tracker-track";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "illusive-dnd-turn-scroll-slider";
  slider.min = "0";
  slider.max = "1000";
  slider.hidden = true;
  for (let i = 0; i < cardCount; i += 1) {
    const card = document.createElement("div");
    card.className = "illusive-dnd-turn-card";
    track.appendChild(card);
  }
  carousel.append(track, slider);
  dock.appendChild(carousel);
  root.appendChild(dock);
  document.body.appendChild(root);
  return { root, track, slider, carousel };
}

// jsdom reports offsetWidth 0, so sizing falls back to the 88px card width.
// trackWidth = n*card + (n-1)*gap8 + TRACK_PADDING(40)
const wideBand = { start: 0, end: 4000, width: 4000, center: 2000 };
const widthFor = (n) => `${n * 88 + (n - 1) * 8 + 40}px`;

describe("getMaxCards", () => {
  it("clamps the setting to 1–16 and defaults to 9", () => {
    installFoundry({ settings: {} });
    expect(getMaxCards()).toBe(9);
    installFoundry({ settings: { turnTrackerMaxCards: 25 } });
    expect(getMaxCards()).toBe(16);
    installFoundry({ settings: { turnTrackerMaxCards: 0 } });
    expect(getMaxCards()).toBe(1);
    installFoundry({ settings: { turnTrackerMaxCards: 5 } });
    expect(getMaxCards()).toBe(5);
  });
});

describe("sizeCarouselWindow", () => {
  it("makes the track scrollable when the scroll setting is on, clipped when off", () => {
    installFoundry({ settings: { turnTrackerScroll: true } });
    const on = mountFullTracker(4);
    sizeCarouselWindow(on.root, wideBand, 1);
    expect(on.track.style.overflowX).toBe("auto");

    installFoundry({ settings: { turnTrackerScroll: false } });
    const off = mountFullTracker(4);
    sizeCarouselWindow(off.root, wideBand, 1);
    expect(off.track.style.overflowX).toBe("hidden");
  });

  it("pins the track to a whole number of cards, capped at the max, on a roomy band", () => {
    installFoundry({ settings: { turnTrackerMaxCards: 9 } });
    const { root, track } = mountFullTracker(12);
    sizeCarouselWindow(root, wideBand, 1);
    expect(track.style.width).toBe(widthFor(9));
    expect(track.style.flex).toBe("0 0 auto");
  });

  it("uses the card count when it is below the cap", () => {
    installFoundry({ settings: { turnTrackerMaxCards: 9 } });
    const { root, track } = mountFullTracker(3);
    sizeCarouselWindow(root, wideBand, 1);
    expect(track.style.width).toBe(widthFor(3));
  });

  it("shows fewer cards than the cap when the band is too narrow to fit them", () => {
    installFoundry({ settings: { turnTrackerMaxCards: 9 } });
    const { root, track } = mountFullTracker(12);
    // trackRoom = 300 - 40 = 260; slot = 96; fit = floor((260 + 8) / 96) = 2
    sizeCarouselWindow(root, { start: 0, end: 300, width: 300, center: 150 }, 1);
    expect(track.style.width).toBe(widthFor(2));
  });

  it("clears sizing and reports overflow when there are no cards yet", () => {
    installFoundry({ settings: { turnTrackerScroll: true } });
    const { root, track, slider } = mountFullTracker(0);
    sizeCarouselWindow(root, wideBand, 1);
    expect(track.style.width).toBe("");
    expect(track.style.overflowX).toBe("auto");
    expect(slider.hidden).toBe(true);
  });
});

describe("updateCarouselScrollSlider", () => {
  it("shows the slider when content overflows the track viewport", () => {
    installFoundry({ settings: { turnTrackerScroll: true } });
    const { root, track, slider } = mountFullTracker(12);
    sizeCarouselWindow(root, wideBand, 1);
    Object.defineProperty(track, "scrollWidth", { value: 900, configurable: true });
    Object.defineProperty(track, "clientWidth", { value: 300, configurable: true });
    track.scrollLeft = 300;
    updateCarouselScrollSlider(root);
    expect(slider.hidden).toBe(false);
    expect(slider.max).toBe("1000");
    expect(slider.dataset.maxScroll).toBe("600");
    expect(slider.value).toBe("500");
  });

  it("hides the slider when scrolling is disabled or content fits", () => {
    installFoundry({ settings: { turnTrackerScroll: false } });
    const off = mountFullTracker(12);
    Object.defineProperty(off.track, "scrollWidth", { value: 900, configurable: true });
    Object.defineProperty(off.track, "clientWidth", { value: 300, configurable: true });
    updateCarouselScrollSlider(off.root);
    expect(off.slider.hidden).toBe(true);

    installFoundry({ settings: { turnTrackerScroll: true } });
    const fits = mountFullTracker(3);
    Object.defineProperty(fits.track, "scrollWidth", { value: 200, configurable: true });
    Object.defineProperty(fits.track, "clientWidth", { value: 200, configurable: true });
    updateCarouselScrollSlider(fits.root);
    expect(fits.slider.hidden).toBe(true);
  });
});

describe("measureControlExtents", () => {
  it("provides active-card glow clearance via the track's inner padding", () => {
    // The glow room is the track pad, not the menu gap — that keeps gaps equal.
    expect(TRACK_PADDING_INLINE).toBeGreaterThanOrEqual(ACTIVE_CARD_GLOW_CLEARANCE);
    expect(ACTIVE_CARD_GLOW_CLEARANCE).toBeGreaterThanOrEqual(16);
  });

  it("reports GM control overflow, right side compensating by one track-pad", () => {
    installFoundry();
    const { root } = mountFullTracker(4);
    const left = document.createElement("div");
    left.className = "illusive-dnd-turn-controls illusive-dnd-turn-controls-left";
    Object.defineProperty(left, "offsetWidth", { value: 180, configurable: true });
    const right = document.createElement("div");
    right.className = "illusive-dnd-turn-controls illusive-dnd-turn-controls-right";
    Object.defineProperty(right, "offsetWidth", { value: 210, configurable: true });
    root.querySelector(".illusive-dnd-turn-dock").append(left, right);
    expect(measureControlExtents(root)).toEqual({
      leftExt: 180 + CONTROL_GAP,
      rightExt: 210 + CONTROL_GAP_RIGHT
    });
  });
});

describe("getDockVisualRect", () => {
  it("includes overflowing GM controls, not just the carousel box", () => {
    installFoundry();
    const { root } = mountFullTracker(4);
    const dock = root.querySelector(".illusive-dnd-turn-dock");
    const carousel = root.querySelector(".illusive-dnd-turn-carousel");
    carousel.getBoundingClientRect = () => ({
      left: 400, right: 800, top: 0, bottom: 100, width: 400, height: 100, x: 400, y: 0
    });
    dock.getBoundingClientRect = () => carousel.getBoundingClientRect();

    const left = document.createElement("div");
    left.className = "illusive-dnd-turn-controls illusive-dnd-turn-controls-left";
    left.getBoundingClientRect = () => ({
      left: 200, right: 390, top: 0, bottom: 40, width: 190, height: 40, x: 200, y: 0
    });
    const right = document.createElement("div");
    right.className = "illusive-dnd-turn-controls illusive-dnd-turn-controls-right";
    right.getBoundingClientRect = () => ({
      left: 810, right: 1020, top: 0, bottom: 40, width: 210, height: 40, x: 810, y: 0
    });
    dock.append(left, right);

    const visual = getDockVisualRect(root);
    expect(visual.left).toBe(200);
    expect(visual.right).toBe(1020);
    expect(visual.center).toBe(610);
  });
});

describe("alignTurnTrackerToBand", () => {
  it("centres the full dock then shifts left when controls overflow the right edge", () => {
    installFoundry();
    const { root } = mountFullTracker(4);
    const band = { start: 60, end: 1000, width: 940, center: 530 };
    const carousel = root.querySelector(".illusive-dnd-turn-carousel");
    const left = document.createElement("div");
    left.className = "illusive-dnd-turn-controls illusive-dnd-turn-controls-left";
    const right = document.createElement("div");
    right.className = "illusive-dnd-turn-controls illusive-dnd-turn-controls-right";
    root.querySelector(".illusive-dnd-turn-dock").append(left, right);

    root.style.left = "700px";
    // Full visual spans 200..1050 (center 625). Band center 530 → shift left by 95.
    left.getBoundingClientRect = () => ({
      left: 200, right: 390, top: 0, bottom: 40, width: 190, height: 40, x: 200, y: 0
    });
    carousel.getBoundingClientRect = () => ({
      left: 400, right: 850, top: 0, bottom: 100, width: 450, height: 100, x: 400, y: 0
    });
    right.getBoundingClientRect = () => ({
      left: 860, right: 1050, top: 0, bottom: 40, width: 190, height: 40, x: 860, y: 0
    });

    alignTurnTrackerToBand(root, band);
    expect(parseFloat(root.style.left)).toBeLessThan(700);
  });
});

describe("scrollFromSlider / sliderFromScroll", () => {
  it("maps proportionally between slider steps and pixel scroll", () => {
    installFoundry();
    const { track, slider } = mountFullTracker(4);
    slider.dataset.maxScroll = "600";
    slider.value = "500";
    expect(scrollFromSlider(track, slider)).toBe(300);
    track.scrollLeft = 300;
    expect(sliderFromScroll(track, slider)).toBe(500);
  });
});

describe("bindCarouselScroll", () => {
  it("syncs the slider position when the track scrolls", () => {
    installFoundry({ settings: { turnTrackerScroll: true } });
    const { root, track, slider } = mountFullTracker(4);
    bindCarouselScroll(root);
    slider.dataset.maxScroll = "200";
    Object.defineProperty(track, "scrollLeft", { value: 0, writable: true, configurable: true });
    track.scrollLeft = 100;
    track.dispatchEvent(new Event("scroll"));
    expect(slider.value).toBe("500");
  });

  it("moves the track when the slider is dragged", () => {
    installFoundry({ settings: { turnTrackerScroll: true } });
    const { root, track, slider } = mountFullTracker(4);
    bindCarouselScroll(root);
    Object.defineProperty(track, "scrollLeft", { value: 0, writable: true, configurable: true });
    slider.dataset.maxScroll = "200";
    slider.value = "600";
    slider.dispatchEvent(new Event("input"));
    expect(track.scrollLeft).toBe(120);
  });
});
