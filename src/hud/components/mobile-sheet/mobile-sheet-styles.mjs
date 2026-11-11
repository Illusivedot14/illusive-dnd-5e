/** Critical mobile-sheet CSS. */
export const MOBILE_SHEET_CRITICAL_CSS = `
/* ---- Theme tokens (purple) ---- */
body.illusive-dnd-mobile-client {
  --mobile-bg-primary: #16121f;
  --mobile-bg-secondary: #1f1830;
  --mobile-bg-tertiary: rgba(180,140,255,0.10);
  --mobile-bg-button: rgba(180,140,255,0.08);
  --mobile-bg-button-active: rgba(180,140,255,0.18);
  --mobile-border: rgba(180,140,255,0.18);
  --mobile-text-primary: #f3eefc;
  --mobile-text-secondary: #b9a9d4;
  --mobile-text-muted: #7d6f96;
  --mobile-accent: #b794f6;
  --mobile-accent-70: rgba(183,148,246,0.7);
  --mobile-accent-50: rgba(183,148,246,0.5);
  --mobile-accent-45: rgba(183,148,246,0.45);
  --mobile-accent-20: rgba(183,148,246,0.22);
  --mobile-accent-10: rgba(183,148,246,0.12);
  --mobile-shadow: rgba(20,8,40,0.4);
  --mobile-shadow-strong: rgba(10,4,24,0.65);
  --mobile-btn-bg: #2a2140;
  --mobile-btn-border: rgba(183,148,246,0.28);
  --mobile-btn-bg-subtle: rgba(183,148,246,0.10);
  --mobile-page-bg: #121116;
}

/* ---- Sheet-only backdrop (behind carousel / sheet) ---- */
#illusive-dnd-mobile-nocanvas-bg {
  position: fixed !important;
  inset: 0 !important;
  z-index: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
  background: var(--mobile-page-bg, #121116);
}
#illusive-dnd-mobile-nocanvas-bg .illusive-dnd-nocanvas-bg-image {
  position: absolute !important;
  inset: 0 !important;
  background-size: cover !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  background-color: var(--mobile-bg-secondary, #1a1820);
}
#illusive-dnd-mobile-nocanvas-bg.has-image .illusive-dnd-nocanvas-bg-image {
  background-color: transparent;
}
#illusive-dnd-mobile-nocanvas-bg .illusive-dnd-nocanvas-bg-vignette {
  position: absolute !important;
  inset: 0 !important;
  pointer-events: none !important;
  background: radial-gradient(
    ellipse at center,
    transparent 15%,
    rgba(0, 0, 0, 0.25) 30%,
    rgba(0, 0, 0, 0.75) 65%,
    rgba(0, 0, 0, 1) 100%
  );
}
body.illusive-dnd-mobile-client {
  background: var(--mobile-page-bg, #121116) !important;
}

/* ---- Hide desktop Foundry chrome on mobile clients ---- */
body.illusive-dnd-mobile-client #board,
body.illusive-dnd-mobile-client #ui-left,
body.illusive-dnd-mobile-client #ui-right,
body.illusive-dnd-mobile-client #ui-top,
body.illusive-dnd-mobile-client #ui-bottom,
body.illusive-dnd-mobile-client #sidebar,
body.illusive-dnd-mobile-client #navigation,
body.illusive-dnd-mobile-client #players,
body.illusive-dnd-mobile-client #hotbar,
body.illusive-dnd-mobile-client #fps,
body.illusive-dnd-mobile-client #logo,
body.illusive-dnd-mobile-client #pause,
body.illusive-dnd-mobile-client #illusive-dnd-hud-overlay,
body.illusive-dnd-mobile-client #illusive-dnd-action-bar-dock,
body.illusive-dnd-mobile-client #illusive-dnd-party-status,
body.illusive-dnd-mobile-client #illusive-dnd-turn-tracker,
body.illusive-dnd-mobile-client #illusive-dnd-token-statuses {
  display: none !important;
}

/* Do not pin Foundry windows. bringToFront() writes an inline z-index
   (application.mjs:1516-1522). A locked value keeps the first popout
   above every menu opened from it (settings.mjs #onOpenApp). */
#illusive-dnd-mobile-sidebar-close {
  position: fixed;
  top: max(10px, env(safe-area-inset-top, 0px));
  left: max(10px, env(safe-area-inset-left, 0px));
  z-index: 100190;
  width: 44px;
  height: 44px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 50%;
  background: rgba(22, 18, 32, 0.82);
  color: #f4eefe;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  cursor: pointer;
}

/* Hide foreign mobile chrome so only the Illusive sheet shows */
body.illusive-dnd-mobile-client .mobile-sheet-carousel:not(#illusive-dnd-mobile-carousel),
body.illusive-dnd-mobile-client .mobile-sheet-drawer:not(.illusive-dnd-illusive-mobile-sheet),
body.illusive-dnd-mobile-client .mobile-chat-drawer,
body.illusive-dnd-mobile-client .mobile-button-stack {
  display: none !important;
}

/* ---- Illusive character carousel (below sheet body, themed dock) ---- */
body.illusive-dnd-mobile-client {
  --illusive-dnd-carousel-dock: calc(96px + env(safe-area-inset-bottom, 0px));
}
#illusive-dnd-mobile-carousel {
  --avatar-size: clamp(60px, 16vw, 72px);
  --carousel-glow-pad: 14px;
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  transform: none;
  z-index: 100001;
  width: 100%;
  max-width: none;
  height: var(--illusive-dnd-carousel-dock);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  box-sizing: border-box;
  pointer-events: auto;
  overflow: visible;
  background: linear-gradient(
    to top,
    var(--mobile-page-bg, #121116) 55%,
    color-mix(in srgb, var(--mobile-page-bg, #121116) 88%, transparent) 100%
  );
  border-top: 1px solid var(--mobile-border, rgba(255,255,255,0.12));
}
/* Fade only on a pseudo so it doesn't clip the focus glow */
#illusive-dnd-mobile-carousel::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  background: linear-gradient(to right, rgba(var(--mobile-page-bg-rgb, 18,17,22), 0.92) 0%, transparent 14%, transparent 86%, rgba(var(--mobile-page-bg-rgb, 18,17,22), 0.92) 100%);
}
#illusive-dnd-mobile-carousel[hidden] { display: none !important; }
#illusive-dnd-mobile-carousel-track,
#illusive-dnd-mobile-carousel .illusive-dnd-mobile-carousel-track {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  /* Side padding = half viewport minus half avatar so snap/center lands on screen center */
  padding: var(--carousel-glow-pad) calc(50% - var(--avatar-size) / 2);
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: calc(50% - var(--avatar-size) / 2);
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  -webkit-mask-image: none;
  mask-image: none;
}
#illusive-dnd-mobile-carousel .illusive-dnd-mobile-carousel-track::-webkit-scrollbar { display: none; }
#illusive-dnd-mobile-carousel .illusive-dnd-carousel-avatar {
  position: relative;
  flex: 0 0 var(--avatar-size);
  width: var(--avatar-size);
  height: var(--avatar-size);
  padding: 0;
  border: 3px solid var(--mobile-btn-border, rgba(255,255,255,0.18));
  border-radius: 50%;
  background: var(--mobile-btn-bg, #2a2930);
  box-shadow: 0 4px 8px rgba(0,0,0,0.45);
  overflow: visible;
  scroll-snap-align: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
  will-change: transform;
}
#illusive-dnd-mobile-carousel .illusive-dnd-carousel-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
  pointer-events: none;
}
/* Center / focused character — glow inside padded track so it is not clipped */
#illusive-dnd-mobile-carousel .illusive-dnd-carousel-avatar.is-focused {
  border-color: var(--mobile-accent, #b794f6) !important;
  transform: scale(1.04);
  box-shadow:
    0 0 0 2px var(--mobile-accent-45, rgba(183, 148, 246, 0.45)),
    0 0 14px 4px var(--mobile-accent-70, rgba(183, 148, 246, 0.7)),
    0 4px 10px rgba(0,0,0,0.45) !important;
  z-index: 2;
}
#illusive-dnd-mobile-carousel .illusive-dnd-carousel-close {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 1.35rem;
  opacity: 0;
  pointer-events: none;
  background: rgba(0,0,0,0.35);
  border-radius: 50%;
  transition: opacity 0.15s ease;
}
#illusive-dnd-mobile-carousel.is-open .illusive-dnd-carousel-avatar.is-selected img { opacity: 0.35; }
#illusive-dnd-mobile-carousel.is-open .illusive-dnd-carousel-avatar.is-selected .illusive-dnd-carousel-close { opacity: 1; }
/* Keep all party avatars visible so you can switch — do not hide non-selected. */

#illusive-dnd-mobile-sheet-root .illusive-dnd-illusive-mobile-sheet.mobile-sheet-drawer {
  position: fixed !important;
  inset: 0 !important;
  z-index: 1 !important;
  pointer-events: all !important;
}
#illusive-dnd-mobile-sheet-root .drawer-backdrop {
  display: none !important;
}
#illusive-dnd-mobile-sheet-root .drawer-content {
  position: fixed !important;
  inset: 0 !important;
  left: 0 !important;
  right: 0 !important;
  top: 0 !important;
  bottom: var(--illusive-dnd-carousel-dock, 96px) !important;
  margin: 0 !important;
  width: 100% !important;
  max-width: none !important;
  height: auto !important;
  max-height: none !important;
  background: var(--mobile-bg-primary, #1e1d21) !important;
  border-radius: 0 !important;
  border: none !important;
  border-bottom: 1px solid var(--mobile-border, rgba(255,255,255,0.12)) !important;
  box-shadow: none !important;
  display: flex !important;
  flex-direction: column !important;
  color: var(--mobile-text-primary, #fff) !important;
  overflow: hidden !important;
  transform: none !important;
  padding-top: env(safe-area-inset-top, 0px) !important;
  padding-bottom: 0 !important;
  box-sizing: border-box !important;
}
/* No swipe-down affordance — sheet is full-screen, close via carousel */
#illusive-dnd-mobile-sheet-root .drawer-handle {
  display: none !important;
}
#illusive-dnd-mobile-sheet-root .drawer-header {
  flex-shrink: 0;
  background: linear-gradient(120deg, var(--mobile-accent-10, rgba(183,148,246,0.12)) 0%, var(--mobile-bg-secondary, #1f1830) 55%);
  border-bottom: 1px solid var(--mobile-border, rgba(255,255,255,0.12));
}
#illusive-dnd-mobile-sheet-root .header-top {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  padding-right: 56px;
}
#illusive-dnd-mobile-sheet-root .header-info {
  flex: 1;
  min-width: 0;
  display: grid !important;
  grid-template-columns: 1fr auto !important;
  grid-template-rows: auto auto !important;
  gap: 0 8px !important;
  align-items: center !important;
}
#illusive-dnd-mobile-sheet-root .char-name {
  grid-column: 1 / 3 !important;
  grid-row: 1 !important;
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--mobile-text-primary, #fff);
}
#illusive-dnd-mobile-sheet-root .char-details {
  grid-column: 1 !important;
  grid-row: 2 !important;
  font-size: 0.85rem;
  color: var(--mobile-text-secondary, #aaa);
}
#illusive-dnd-mobile-sheet-root .hp-display {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 4px !important;
  margin-top: 0 !important;
  grid-column: 2 !important;
  grid-row: 2 / -1 !important;
  justify-self: end !important;
  align-self: stretch !important;
  border: 1px solid var(--mobile-border, rgba(255,255,255,0.18)) !important;
  background: var(--mobile-btn-bg-subtle, rgba(255,255,255,0.08)) !important;
  border-radius: 8px !important;
  padding: 6px 12px !important;
  color: inherit !important;
  cursor: pointer !important;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset !important;
  min-height: 44px !important;
  min-width: 5.5rem !important;
}
#illusive-dnd-mobile-sheet-root .hp-display:active {
  background: var(--mobile-bg-button-active, rgba(255,255,255,0.14)) !important;
}
#illusive-dnd-mobile-sheet-root .hp-current {
  font-size: 1.35rem !important;
  font-weight: 700 !important;
  color: var(--mobile-accent, #b794f6) !important;
}
#illusive-dnd-mobile-sheet-root .hp-separator,
#illusive-dnd-mobile-sheet-root .hp-max {
  color: var(--mobile-text-secondary, #aaa) !important;
  font-size: 1.15rem !important;
}
#illusive-dnd-mobile-sheet-root .hp-temp { color: #4fc3f7; font-weight: 600; }
#illusive-dnd-mobile-sheet-root .header-avatar {
  width: 64px !important;
  height: 64px !important;
  border-radius: 50% !important;
  object-fit: cover !important;
  object-position: top !important;
  border: 2px solid rgba(255,255,255,0.22) !important;
  display: block !important;
}
#illusive-dnd-mobile-sheet-root .inspiration-indicator {
  position: absolute;
  right: -2px;
  bottom: -2px;
  color: #f0c14a;
  opacity: 0;
}
#illusive-dnd-mobile-sheet-root .avatar-container.has-inspiration .inspiration-indicator { opacity: 1; }

/* Compact inspiration box in the stats row */
#illusive-dnd-mobile-sheet-root .stat-box.insp-box {
  cursor: pointer !important;
  -webkit-tap-highlight-color: transparent;
}
#illusive-dnd-mobile-sheet-root .stat-box.insp-box .stat-value {
  font-size: 1.05rem !important;
  line-height: 1 !important;
  color: var(--mobile-text-muted, #7d6f96) !important;
}
#illusive-dnd-mobile-sheet-root .stat-box.insp-box.is-on {
  border-color: rgba(240, 193, 74, 0.55) !important;
  background: rgba(240, 193, 74, 0.14) !important;
}
#illusive-dnd-mobile-sheet-root .stat-box.insp-box.is-on .stat-value,
#illusive-dnd-mobile-sheet-root .stat-box.insp-box.is-on label {
  color: #f0c14a !important;
}
#illusive-dnd-mobile-sheet-root .stat-box.insp-box:active {
  filter: brightness(1.08);
}

/* Death saves: centered on the sheet/phone, balanced 3 | skull | 3 */
#illusive-dnd-mobile-sheet-root .death-save-overlay,
#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-death {
  position: relative !important;
  left: auto !important;
  top: auto !important;
  transform: none !important;
  z-index: 5 !important;
  display: grid !important;
  grid-template-columns: 1fr auto 1fr !important;
  align-items: center !important;
  justify-items: center !important;
  column-gap: 12px !important;
  width: 100% !important;
  max-width: 320px !important;
  margin: 10px auto 6px !important;
  padding: 8px 14px !important;
  box-sizing: border-box !important;
  border-radius: 10px !important;
  background: var(--mobile-bg-secondary, #25242a) !important;
  border: 1px solid var(--mobile-border, rgba(255,255,255,0.12)) !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.35) !important;
  pointer-events: auto !important;
}
#illusive-dnd-mobile-sheet-root .death-saves-group,
#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-death-group {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  flex: 0 0 auto !important;
  width: 100% !important;
}
#illusive-dnd-mobile-sheet-root .death-saves-group.success {
  justify-content: flex-end !important;
}
#illusive-dnd-mobile-sheet-root .death-saves-group.failure {
  justify-content: flex-start !important;
}
#illusive-dnd-mobile-sheet-root .death-pip,
#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-pip {
  flex: 0 0 auto !important;
  width: 18px !important;
  height: 18px !important;
  min-width: 18px !important;
  min-height: 18px !important;
  border-radius: 50% !important;
  border: 2px solid rgba(255,255,255,0.5) !important;
  background: transparent !important;
  padding: 0 !important;
  margin: 0 !important;
  cursor: pointer !important;
  box-sizing: border-box !important;
}
/* Color from group so failures always light red when .filled */
#illusive-dnd-mobile-sheet-root .death-saves-group.success .death-pip.filled,
#illusive-dnd-mobile-sheet-root .death-saves-group.success .illusive-dnd-ms-pip.is-filled,
#illusive-dnd-mobile-sheet-root .death-pip.filled.is-success,
#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-pip.is-success.is-filled {
  background: #62d58a !important;
  border-color: #62d58a !important;
}
#illusive-dnd-mobile-sheet-root .death-saves-group.failure .death-pip.filled,
#illusive-dnd-mobile-sheet-root .death-saves-group.failure .illusive-dnd-ms-pip.is-filled,
#illusive-dnd-mobile-sheet-root .death-pip.filled.is-failure,
#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-pip.is-failure.is-filled {
  background: #ef6b6b !important;
  border-color: #ef6b6b !important;
}
#illusive-dnd-mobile-sheet-root .death-skull,
#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-death-roll {
  flex: 0 0 auto !important;
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  border-radius: 50% !important;
  border: 1px solid rgba(255,255,255,0.2) !important;
  background: rgba(0,0,0,0.35) !important;
  color: #fff !important;
  cursor: pointer !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 1.05rem !important;
  padding: 0 !important;
  justify-self: center !important;
}
#illusive-dnd-mobile-sheet-root .header-top {
  display: flex;
  align-items: center;
  margin-bottom: 0;
}
#illusive-dnd-mobile-sheet-root .drawer-header:has(.death-save-overlay) .header-top,
#illusive-dnd-mobile-sheet-root .drawer-header:has(.illusive-dnd-ms-death) .header-top {
  margin-bottom: 0 !important;
}
#illusive-dnd-mobile-sheet-root .hp-bar-thin {
  height: 4px;
  background: var(--mobile-bg-tertiary, rgba(255,255,255,0.08));
  margin: 8px -16px 0;
  display: flex;
  overflow: hidden;
}
#illusive-dnd-mobile-sheet-root .hp-bar-fill {
  height: 100%;
  background: linear-gradient(to right, var(--mobile-accent, #b794f6), var(--mobile-accent-45, rgba(183,148,246,0.45)));
}
#illusive-dnd-mobile-sheet-root .hp-bar-temp {
  height: 100%;
  background: rgba(79,195,247,0.65);
}
/* 5 equal boxes — AC / Speed / Init / Prof / Insp */
#illusive-dnd-mobile-sheet-root .stats-row {
  display: grid !important;
  grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
  gap: 8px !important;
  margin-top: 10px !important;
  padding: 8px 16px !important;
  margin-left: -16px !important;
  margin-right: -16px !important;
  margin-bottom: 12px !important;
  height: auto !important;
  min-height: 0 !important;
  background: var(--mobile-accent-10, rgba(183,148,246,0.1)) !important;
  align-items: stretch !important;
}
#illusive-dnd-mobile-sheet-root .stat-box {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 2px !important;
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
  aspect-ratio: auto !important;
  height: auto !important;
  min-height: 4.25rem !important;
  border: 1px solid var(--mobile-border, rgba(255,255,255,0.12)) !important;
  border-radius: 10px !important;
  background: var(--mobile-bg-tertiary, rgba(255,255,255,0.06)) !important;
  color: inherit !important;
  padding: 10px 6px !important;
  margin: 0 !important;
  box-shadow: none !important;
  line-height: 1.2 !important;
}
#illusive-dnd-mobile-sheet-root .stat-box .stat-value {
  font-weight: 700 !important;
  font-size: 1.25rem !important;
  line-height: 1.15 !important;
  color: var(--mobile-text-primary, #fff) !important;
}
#illusive-dnd-mobile-sheet-root .stat-box label {
  font-size: 0.65rem !important;
  text-transform: uppercase !important;
  color: var(--mobile-text-secondary, #aaa) !important;
  margin: 0 !important;
  line-height: 1.2 !important;
}
/* Amethyst injects a fake "INITIATIVE" label — kill it */
#illusive-dnd-mobile-sheet-root .init-box::before,
#illusive-dnd-mobile-sheet-root .init-box::after {
  content: none !important;
  display: none !important;
}
#illusive-dnd-mobile-sheet-root .ac-box,
#illusive-dnd-mobile-sheet-root .speed-box,
#illusive-dnd-mobile-sheet-root .init-box {
  min-width: 0 !important;
  aspect-ratio: auto !important;
}

#illusive-dnd-mobile-sheet-root .section-nav { flex-shrink: 0; position: relative; }
#illusive-dnd-mobile-sheet-root .section-nav-track {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  overflow-x: auto;
  scrollbar-width: none;
  background: var(--mobile-bg-secondary, #25242a);
  border-bottom: 1px solid var(--mobile-border, rgba(255,255,255,0.12));
}
#illusive-dnd-mobile-sheet-root .section-nav-track::-webkit-scrollbar { display: none; }
#illusive-dnd-mobile-sheet-root .section-tab {
  flex: 0 0 auto;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--mobile-text-secondary, #aaa);
  padding: 8px 12px;
  font-size: 0.85rem;
}
#illusive-dnd-mobile-sheet-root .section-tab.active {
  color: #fff;
  background: var(--mobile-accent, #b794f6);
}
#illusive-dnd-mobile-sheet-root .sections-viewport {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}
#illusive-dnd-mobile-sheet-root .sections-container {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
/* One section; tab bodies are toggled via Handlebars {{#if tabs.*}}, not .active */
#illusive-dnd-mobile-sheet-root .sheet-section {
  display: block !important;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
#illusive-dnd-mobile-sheet-root .ability-check-area,
#illusive-dnd-mobile-sheet-root .skill-row,
#illusive-dnd-mobile-sheet-root .item-row,
#illusive-dnd-mobile-sheet-root .feature-row,
#illusive-dnd-mobile-sheet-root .spell-row,
#illusive-dnd-mobile-sheet-root .effect-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
}
#illusive-dnd-mobile-sheet-root .ability-check-area:active,
#illusive-dnd-mobile-sheet-root .skill-row:active,
#illusive-dnd-mobile-sheet-root .item-row:active,
#illusive-dnd-mobile-sheet-root .feature-row:active,
#illusive-dnd-mobile-sheet-root .spell-row:active {
  background: var(--mobile-bg-button-active, rgba(255,255,255,0.1));
}

#illusive-dnd-mobile-sheet-root {
  position: fixed !important;
  inset: 0 !important;
  z-index: 100000 !important;
  pointer-events: none !important;
}
#illusive-dnd-mobile-sheet-root:empty { display: none !important; }
#illusive-dnd-mobile-sheet-root.illusive-dnd-mobile-sheet-behind-dialog { z-index: 100 !important; }

/* Foundry dialogs / confirms must sit above the mobile sheet + carousel dock. */
body.illusive-dnd-foundry-dialog-open #illusive-dnd-mobile-sheet-root,
body.illusive-dnd-foundry-dialog-open #illusive-dnd-mobile-carousel,
body.illusive-dnd-foundry-dialog-open #illusive-dnd-mobile-dice-roller,
body.illusive-dnd-mobile-sidebar-open #illusive-dnd-mobile-sheet-root,
body.illusive-dnd-mobile-sidebar-open #illusive-dnd-mobile-carousel,
body.illusive-dnd-mobile-sidebar-open #illusive-dnd-mobile-dice-roller {
  pointer-events: none !important;
}
body.illusive-dnd-mobile-target-picking #illusive-dnd-mobile-dice-roller {
  visibility: hidden !important;
  pointer-events: none !important;
}
body.illusive-dnd-foundry-dialog-open #illusive-dnd-mobile-sheet-root,
body.illusive-dnd-mobile-sidebar-open #illusive-dnd-mobile-sheet-root {
  z-index: 100 !important;
}
body.illusive-dnd-foundry-dialog-open #illusive-dnd-mobile-carousel,
body.illusive-dnd-mobile-sidebar-open #illusive-dnd-mobile-carousel,
body.illusive-dnd-mobile-sidebar-open #illusive-dnd-mobile-dice-roller {
  z-index: 99 !important;
}

/* Swipe chat rules use --mobile-text-primary (#ffffff / near-white from
   mobile-accent.mjs). Foundry chat cards are light parchment. */
body.illusive-dnd-mobile-client .application .chat-message,
body.illusive-dnd-mobile-client .application .chat-message .message-header,
body.illusive-dnd-mobile-client .application .chat-message .message-header .title,
body.illusive-dnd-mobile-client .application .chat-message .message-header h4,
body.illusive-dnd-mobile-client .application .chat-message .message-content,
body.illusive-dnd-mobile-client .application .chat-message .message-content > *,
body.illusive-dnd-mobile-client .application .chat-message .dice-formula,
body.illusive-dnd-mobile-client .application .chat-message .dice-total {
  color: var(--color-text-primary) !important;
}
body.illusive-dnd-mobile-client .application .chat-message .flavor-text,
body.illusive-dnd-mobile-client .application .chat-message .message-header .subtitle,
body.illusive-dnd-mobile-client .application .chat-message .message-header .user {
  color: var(--color-text-secondary) !important;
}

/* Foundry toasts must sit above the sheet. */
body.illusive-dnd-mobile-client #notifications,
body.illusive-dnd-mobile-sheet-open #notifications {
  position: fixed !important;
  top: 5% !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  z-index: 100080 !important;
  pointer-events: none !important;
  width: max-content !important;
  max-width: 85vw !important;
}
body.illusive-dnd-mobile-client #notifications .notification,
body.illusive-dnd-mobile-sheet-open #notifications .notification {
  pointer-events: auto !important;
  /* Do not theme toasts — keep Foundry default type colors */
  text-shadow: none !important;
  background: unset !important;
  background-color: unset !important;
  color: unset !important;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.55) !important;
}
body.illusive-dnd-mobile-client #notifications .notification.info,
body.illusive-dnd-mobile-sheet-open #notifications .notification.info {
  background: rgba(48, 112, 160, 0.95) !important;
  color: #fff !important;
}
body.illusive-dnd-mobile-client #notifications .notification.warning,
body.illusive-dnd-mobile-client #notifications .notification.warn,
body.illusive-dnd-mobile-sheet-open #notifications .notification.warning,
body.illusive-dnd-mobile-sheet-open #notifications .notification.warn {
  background: rgba(180, 120, 20, 0.95) !important;
  color: #fff !important;
}
body.illusive-dnd-mobile-client #notifications .notification.error,
body.illusive-dnd-mobile-sheet-open #notifications .notification.error {
  background: rgba(160, 40, 40, 0.95) !important;
  color: #fff !important;
}
body.illusive-dnd-mobile-client #notifications .notification:not(.info):not(.warning):not(.warn):not(.error),
body.illusive-dnd-mobile-sheet-open #notifications .notification:not(.info):not(.warning):not(.warn):not(.error) {
  background: rgba(40, 40, 48, 0.95) !important;
  color: #fff !important;
}

/* Dice So Nice must render above the mobile sheet + carousel. */
body.illusive-dnd-dsn-showing #dice-box-canvas,
body.illusive-dnd-dsn-showing #dice-box-canvas canvas {
  z-index: 200000 !important;
  pointer-events: none !important;
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
}
body.illusive-dnd-dsn-showing #illusive-dnd-mobile-sheet-root {
  z-index: 100 !important;
}
body.illusive-dnd-dsn-showing #illusive-dnd-mobile-carousel {
  z-index: 101 !important;
}

/* Dice So Nice config app above mobile sheet */
body.illusive-dnd-mobile-client.illusive-dnd-dsn-config-open #dice-config,
body.illusive-dnd-mobile-client.illusive-dnd-dsn-config-open .application.dice-so-nice,
body.illusive-dnd-mobile-client #dice-config,
body.illusive-dnd-mobile-client .application.dice-so-nice {
  z-index: 100200 !important;
}
body.illusive-dnd-mobile-client.illusive-dnd-dsn-config-open #illusive-dnd-mobile-sheet-root {
  z-index: 100 !important;
}
body.illusive-dnd-mobile-client.illusive-dnd-dsn-config-open #illusive-dnd-mobile-carousel {
  z-index: 101 !important;
}
body.illusive-dnd-dsn-hide-chrome {
  visibility: hidden !important;
  pointer-events: none !important;
}

/* Gear settings menu — full-width bottom sheet, not a cramped card */
.illusive-dnd-ms-overlay.illusive-dnd-ms-settings-overlay,
.illusive-dnd-ms-overlay.illusive-dnd-ms-accent-overlay {
  align-items: flex-end !important;
  justify-content: stretch !important;
  padding: 0 !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-settings-dialog,
.illusive-dnd-ms-overlay .illusive-dnd-ms-accent-dialog {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  border-radius: 18px 18px 0 0 !important;
  padding: 18px 18px calc(18px + env(safe-area-inset-bottom, 0px)) !important;
  max-height: min(88dvh, 920px) !important;
  overflow: auto !important;
  -webkit-overflow-scrolling: touch;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-settings-list {
  display: flex !important;
  flex-direction: column !important;
  gap: 12px !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-settings-item {
  display: flex !important;
  align-items: center !important;
  gap: 14px !important;
  width: 100% !important;
  margin: 0 !important;
  padding: 16px 16px !important;
  min-height: 64px !important;
  border-radius: 14px !important;
  border: 1px solid var(--mobile-border, rgba(183,148,246,0.28)) !important;
  background: var(--mobile-bg-button, rgba(183,148,246,0.08)) !important;
  color: var(--mobile-text-primary, #fff) !important;
  text-align: left !important;
  cursor: pointer !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-settings-item i {
  width: 1.6rem !important;
  text-align: center !important;
  color: var(--mobile-accent, #b794f6) !important;
  font-size: 1.25rem !important;
  flex: 0 0 auto !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-settings-item span {
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
  min-width: 0 !important;
  flex: 1 1 auto !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-settings-item strong {
  font-size: 1.05rem !important;
  font-weight: 700 !important;
  line-height: 1.2 !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-settings-item small {
  font-size: 0.85rem !important;
  line-height: 1.25 !important;
  color: var(--mobile-text-secondary, #b9a9d4) !important;
  white-space: normal !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-settings-item:active {
  background: var(--mobile-bg-button-active, rgba(183,148,246,0.18)) !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-settings-item.is-current {
  border-color: var(--mobile-accent, #b794f6) !important;
  background: var(--mobile-accent-20, rgba(183,148,246,0.22)) !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-dsn-form {
  display: flex !important;
  flex-direction: column !important;
  gap: 12px !important;
  margin-bottom: 14px !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-dsn-check {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  color: var(--mobile-text-primary, #fff) !important;
  font-size: 0.95rem !important;
  font-weight: 600 !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-dsn-check input {
  width: 18px !important;
  height: 18px !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-dsn-field {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 12px !important;
  color: var(--mobile-text-secondary, #b9a9d4) !important;
  font-size: 0.9rem !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-dsn-field select,
.illusive-dnd-ms-overlay .illusive-dnd-ms-dsn-field input[type="color"] {
  min-width: 9rem !important;
  max-width: 55% !important;
  height: 40px !important;
  border-radius: 8px !important;
  border: 1px solid var(--mobile-border, rgba(255,255,255,0.18)) !important;
  background: var(--mobile-bg-primary, #16121f) !important;
  color: var(--mobile-text-primary, #fff) !important;
  padding: 4px 8px !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-dsn-field input[type="color"] {
  padding: 2px !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-dsn-actions {
  flex-wrap: wrap !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-dsn-test {
  flex: 1 1 100% !important;
  order: -1 !important;
  background: var(--mobile-bg-button, rgba(183,148,246,0.14)) !important;
  border: 1px solid var(--mobile-border, rgba(183,148,246,0.35)) !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-dsn-test:disabled {
  opacity: 0.55 !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-dsn-field input[type="color"]:disabled {
  opacity: 0.45 !important;
  cursor: not-allowed !important;
}

/* Roll / DialogV2 must sit above the lowered sheet + carousel. */
body.illusive-dnd-mobile-sheet-open .application.dnd5e2.roll-configuration,
body.illusive-dnd-mobile-sheet-open .application.dnd5e2.dialog,
body.illusive-dnd-mobile-sheet-open .application.dialog,
body.illusive-dnd-mobile-sheet-open .application.dialog-v2,
body.illusive-dnd-mobile-sheet-open .window-app.dialog {
  z-index: 100050 !important;
}

/* HP + Adv/Dis overlays above the sheet — ignore clicks until shown. */
.illusive-dnd-ms-overlay.hp-dialog-overlay,
.illusive-dnd-ms-overlay.roll-dialog-overlay {
  position: fixed !important;
  inset: 0 !important;
  z-index: 100060 !important;
  display: flex !important;
  align-items: flex-start !important;
  justify-content: center !important;
  padding-top: 10vh !important;
  background: rgba(0, 0, 0, 0.55) !important;
  pointer-events: none !important;
}
.illusive-dnd-ms-overlay.hp-dialog-overlay.visible,
.illusive-dnd-ms-overlay.roll-dialog-overlay.visible {
  pointer-events: all !important;
}
.illusive-dnd-ms-overlay.illusive-dnd-ms-item-overlay {
  align-items: center !important;
  padding: 4vh 12px !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-dialog {
  max-width: min(28rem, 96vw) !important;
  max-height: 84vh !important;
  width: 100% !important;
  padding: 0 !important;
  overflow: hidden !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-dialog .roll-dialog-header {
  padding: 14px 14px 10px !important;
  margin: 0 !important;
  align-items: flex-start !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-heading {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  min-width: 0 !important;
  flex: 1 !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-thumb {
  width: 44px !important;
  height: 44px !important;
  border-radius: 8px !important;
  object-fit: cover !important;
  flex-shrink: 0 !important;
  border: 1px solid var(--mobile-border, rgba(183,148,246,0.28)) !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-titles {
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
  min-width: 0 !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-titles .roll-dialog-title {
  white-space: normal !important;
  line-height: 1.2 !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-subtitle {
  font-size: 0.8rem !important;
  font-weight: 600 !important;
  color: var(--mobile-accent, #b794f6) !important;
  text-transform: none !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-description {
  flex: 1 1 auto !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch !important;
  padding: 0 14px 12px !important;
  max-height: 48vh !important;
  font-size: 0.95rem !important;
  line-height: 1.45 !important;
  color: var(--mobile-text-secondary, #b9a9d4) !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-description p { margin: 0 0 0.65em !important; }
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-description p:last-child { margin-bottom: 0 !important; }
#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-item-description ul,
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-description ul,
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-description ol {
  margin: 0 0 0.75em 1.1em !important;
  padding: 0 !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-description li {
  margin: 0 0 0.35em !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-description a {
  color: var(--mobile-accent, #b794f6) !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-description img {
  max-width: 100% !important;
  height: auto !important;
  border-radius: 6px !important;
  margin: 0.4em 0 !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-actions {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom, 0px)) !important;
  border-top: 1px solid var(--mobile-border, rgba(183,148,246,0.18)) !important;
  background: var(--mobile-bg-primary, #16121f) !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-actions .roll-btn {
  flex: 1 1 calc(50% - 8px) !important;
  min-width: 0 !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-item-actions .roll-btn.is-muted {
  opacity: 0.75 !important;
  flex-basis: 100% !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-accent-actions .roll-btn,
.illusive-dnd-ms-overlay .illusive-dnd-ms-accent-actions .roll-btn.is-muted {
  flex: 1 1 calc(50% - 8px) !important;
  flex-basis: calc(50% - 8px) !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-accent-dialog {
  max-width: 100% !important;
  max-height: min(88dvh, 920px) !important;
  overflow: auto !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-accent-hint,
.illusive-dnd-ms-overlay .illusive-dnd-ms-settings-hint {
  margin: 0 0 14px !important;
  padding: 0 !important;
  font-size: 0.9rem !important;
  line-height: 1.35 !important;
  color: var(--mobile-text-secondary, #b9a9d4) !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-list {
  display: flex !important;
  flex-direction: column !important;
  gap: 10px !important;
  max-height: none !important;
  overflow: visible !important;
  margin-bottom: 14px !important;
  padding-right: 0 !important;
}
.illusive-dnd-ms-overlay button.illusive-dnd-ms-theme-row,
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-row {
  appearance: none !important;
  -webkit-appearance: none !important;
  box-sizing: border-box !important;
  display: grid !important;
  grid-template-columns: 56px minmax(0, 1fr) !important;
  align-items: center !important;
  justify-items: start !important;
  column-gap: 14px !important;
  row-gap: 0 !important;
  width: 100% !important;
  margin: 0 !important;
  padding: 12px 14px !important;
  min-height: 64px !important;
  height: auto !important;
  border-radius: 12px !important;
  border: 1px solid var(--mobile-border, rgba(255,255,255,0.12)) !important;
  background: rgba(0,0,0,0.18) !important;
  color: var(--mobile-text-primary, #fff) !important;
  text-align: left !important;
  line-height: 1.2 !important;
  font: inherit !important;
  cursor: pointer !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-row.is-active {
  border-color: var(--theme, var(--mobile-accent, #b794f6)) !important;
  box-shadow: inset 0 0 0 1px var(--theme, var(--mobile-accent, #b794f6)) !important;
  background: rgba(255,255,255,0.06) !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-preview {
  display: block !important;
  box-sizing: border-box !important;
  width: 56px !important;
  height: 40px !important;
  margin: 0 !important;
  padding: 0 !important;
  flex: none !important;
  align-self: center !important;
  justify-self: start !important;
  border-radius: 8px !important;
  border: 1px solid rgba(255,255,255,0.2) !important;
  background: var(--theme, #b794f6) !important;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25) !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-preview-stripe,
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-preview-block,
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-preview-bg {
  display: none !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-meta {
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  gap: 4px !important;
  min-width: 0 !important;
  width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  align-self: center !important;
  justify-self: stretch !important;
  text-align: left !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-meta strong {
  display: block !important;
  margin: 0 !important;
  font-size: 1.05rem !important;
  font-weight: 700 !important;
  line-height: 1.2 !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-meta small,
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-hex {
  display: block !important;
  margin: 0 !important;
  font-size: 0.8rem !important;
  line-height: 1.2 !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  color: var(--mobile-text-muted, #7d6f96) !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-custom {
  display: flex !important;
  flex-direction: column !important;
  gap: 10px !important;
  margin-bottom: 14px !important;
  color: var(--mobile-text-primary, #fff) !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-custom label {
  font-size: 0.9rem !important;
  color: var(--mobile-text-secondary, #b9a9d4) !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-custom-row {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-custom-row input[type="color"] {
  width: 100% !important;
  height: 48px !important;
  border: 1px solid var(--mobile-border, rgba(255,255,255,0.18)) !important;
  border-radius: 10px !important;
  background: transparent !important;
  padding: 4px !important;
  cursor: pointer !important;
  flex: 1 1 auto !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-theme-hex {
  flex: 0 0 auto !important;
  min-width: 4.5rem !important;
}
#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-btn i {
  margin-right: 6px;
}
.illusive-dnd-ms-overlay .hp-dialog,
.illusive-dnd-ms-overlay .standalone-roll-dialog {
  background: var(--mobile-bg-secondary, #25242a) !important;
  border: 1px solid var(--mobile-border, rgba(255,255,255,0.12)) !important;
  border-radius: 12px !important;
  padding: 16px !important;
  min-width: 260px !important;
  max-width: 22rem !important;
  width: 94% !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important;
  color: var(--mobile-text-primary, #fff) !important;
}
.illusive-dnd-ms-overlay .standalone-roll-dialog {
  transform: translateY(0) !important;
  opacity: 1 !important;
  display: flex !important;
  flex-direction: column !important;
}
.illusive-dnd-ms-overlay.roll-dialog-overlay.visible .standalone-roll-dialog {
  transform: translateY(0) !important;
  opacity: 1 !important;
}
/* Settings / theme must win over the 22rem dialog card rules above */
.illusive-dnd-ms-overlay .standalone-roll-dialog.illusive-dnd-ms-settings-dialog,
.illusive-dnd-ms-overlay .standalone-roll-dialog.illusive-dnd-ms-accent-dialog {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  border-radius: 18px 18px 0 0 !important;
  padding: 18px 18px calc(18px + env(safe-area-inset-bottom, 0px)) !important;
  max-height: min(88dvh, 920px) !important;
}
.illusive-dnd-ms-overlay .hp-dialog-header,
.illusive-dnd-ms-overlay .roll-dialog-header {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  margin-bottom: 14px !important;
  padding-bottom: 12px !important;
  border-bottom: 1px solid var(--mobile-accent, #b794f6) !important;
  position: relative !important;
  background: transparent !important;
}
.illusive-dnd-ms-overlay .hp-dialog-current {
  font-size: 1.5rem !important;
  font-weight: 700 !important;
}
.illusive-dnd-ms-overlay .hp-dialog-temp {
  font-size: 0.875rem !important;
  font-weight: 600 !important;
  color: #4fc3f7 !important;
}
.illusive-dnd-ms-overlay .roll-dialog-title {
  font-size: 1.15rem !important;
  font-weight: 600 !important;
  padding-bottom: 0.25rem !important;
  text-align: center !important;
}
.illusive-dnd-ms-overlay .roll-dialog-close {
  position: absolute !important;
  right: 0 !important;
  top: 0 !important;
  width: 2.25rem !important;
  height: 2.25rem !important;
  background: none !important;
  border: none !important;
  color: var(--mobile-text-secondary, #aaa) !important;
  cursor: pointer !important;
  font-size: 1rem !important;
}
.illusive-dnd-ms-overlay .hp-dialog-input-row {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  margin-bottom: 16px !important;
}
.illusive-dnd-ms-overlay .hp-dialog-adjust {
  width: 44px !important;
  height: 44px !important;
  border-radius: 8px !important;
  border: 1px solid var(--mobile-border, rgba(255,255,255,0.15)) !important;
  background: var(--mobile-bg-tertiary, rgba(255,255,255,0.08)) !important;
  color: var(--mobile-text-secondary, #ccc) !important;
  font-size: 1.25rem !important;
  cursor: pointer !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}
.illusive-dnd-ms-overlay .hp-dialog-amount {
  width: 80px !important;
  height: 3rem !important;
  flex: 1 1 80px !important;
  font-size: 1.5rem !important;
  font-weight: 700 !important;
  text-align: center !important;
  background: var(--mobile-bg-tertiary, rgba(255,255,255,0.08)) !important;
  border: 2px solid var(--mobile-border, rgba(255,255,255,0.15)) !important;
  border-radius: 8px !important;
  color: var(--mobile-text-primary, #fff) !important;
}
.illusive-dnd-ms-overlay .hp-dialog-actions,
.illusive-dnd-ms-overlay .roll-dialog-buttons {
  display: flex !important;
  gap: 8px !important;
  margin-bottom: 12px !important;
}
.illusive-dnd-ms-overlay .hp-dialog-btn {
  flex: 1 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 12px !important;
  border-radius: 6px !important;
  min-height: 2.6rem !important;
  border: none !important;
  font-size: 0.95rem !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  color: #fff !important;
}
.illusive-dnd-ms-overlay .hp-dialog-btn.heal {
  background: #3d8b5a !important;
}
.illusive-dnd-ms-overlay .hp-dialog-btn.damage {
  background: var(--mobile-accent, #b794f6) !important;
}
.illusive-dnd-ms-overlay .hp-dialog-row {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  margin-top: 8px !important;
}
.illusive-dnd-ms-overlay .hp-dialog-row label {
  flex: 0 0 auto !important;
  font-size: 0.85rem !important;
  color: var(--mobile-text-secondary, #aaa) !important;
  min-width: 4.5rem !important;
}
.illusive-dnd-ms-overlay .hp-dialog-field {
  flex: 1 1 auto !important;
  height: 2.4rem !important;
  min-width: 0 !important;
  text-align: center !important;
  background: var(--mobile-bg-tertiary, rgba(255,255,255,0.08)) !important;
  border: 1px solid var(--mobile-border, rgba(255,255,255,0.15)) !important;
  border-radius: 6px !important;
  color: var(--mobile-text-primary, #fff) !important;
  font-size: 1rem !important;
}
.illusive-dnd-ms-overlay .hp-dialog-field-apply {
  width: 2.4rem !important;
  height: 2.4rem !important;
  border-radius: 6px !important;
  border: 1px solid var(--mobile-border, rgba(255,255,255,0.15)) !important;
  background: var(--mobile-bg-tertiary, rgba(255,255,255,0.08)) !important;
  color: var(--mobile-accent, #b794f6) !important;
  cursor: pointer !important;
}
.illusive-dnd-ms-overlay .hp-dialog-field-apply.applied {
  background: var(--mobile-accent, #b794f6) !important;
  color: #fff !important;
}
.illusive-dnd-ms-overlay .roll-btn {
  flex: 1 0 30% !important;
  width: 30% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 12px 4px !important;
  border-radius: 6px !important;
  min-height: 2.6rem !important;
  border: 1px solid var(--mobile-border, rgba(255,255,255,0.15)) !important;
  font-size: 0.7rem !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
  cursor: pointer !important;
  color: var(--mobile-text-secondary, #ccc) !important;
  background: var(--mobile-bg-primary, #1e1d21) !important;
}
.illusive-dnd-ms-overlay .roll-btn:active {
  background: var(--mobile-accent, #b794f6) !important;
  border-color: var(--mobile-accent, #b794f6) !important;
  color: #fff !important;
}

/* Carousel must stay tappable above the sheet (close / cancel). */
body.illusive-dnd-mobile-sheet-open #illusive-dnd-mobile-carousel {
  z-index: 100001 !important;
  pointer-events: auto !important;
}

/* Hide a foreign mobile drawer while ours is open — never hide Illusive's root. */
body.illusive-dnd-mobile-sheet-open .mobile-sheet-drawer:not(.illusive-dnd-illusive-mobile-sheet),
body.illusive-dnd-mobile-sheet-open .application.mobile-character-sheet,
body.illusive-dnd-mobile-sheet-open .mobile-character-sheet:not(.illusive-dnd-illusive-mobile-sheet) {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

#illusive-dnd-mobile-sheet-root > .illusive-dnd-illusive-mobile-sheet.mobile-sheet-drawer {
  pointer-events: all !important;
  z-index: 1 !important;
}

#illusive-dnd-mobile-sheet-root .drawer-content {
  inset: auto !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: var(--illusive-dnd-carousel-dock, 96px) !important;
  width: 100% !important;
  max-width: none !important;
  height: auto !important;
  max-height: none !important;
  border-radius: 0 !important;
  border: none !important;
  border-bottom: 1px solid var(--mobile-border, rgba(255,255,255,0.12)) !important;
  box-shadow: none !important;
  transform: none !important;
  pointer-events: all !important;
  z-index: 2 !important;
  padding-top: env(safe-area-inset-top, 0px) !important;
  padding-bottom: 0 !important;
  box-sizing: border-box !important;
}

#illusive-dnd-mobile-sheet-root .drawer-backdrop,
#illusive-dnd-mobile-sheet-root .drawer-handle {
  display: none !important;
  pointer-events: none !important;
}

#illusive-dnd-mobile-sheet-root button.avatar-container {
  border: none !important;
  background: transparent !important;
  padding: 0 !important;
  margin: 0 !important;
  box-shadow: none !important;
  position: relative !important;
}
#illusive-dnd-mobile-sheet-root button,
#illusive-dnd-mobile-sheet-root [data-action],
#illusive-dnd-mobile-sheet-root .avatar-container,
#illusive-dnd-mobile-sheet-root .ability-check-area,
#illusive-dnd-mobile-sheet-root .skill-roll-btn,
#illusive-dnd-mobile-sheet-root .section-tab {
  cursor: pointer !important;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

#illusive-dnd-mobile-sheet-root .sections-container {
  transform: none !important;
  width: 100% !important;
  flex: 1 1 auto !important;
  min-height: 0 !important;
  height: auto !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}
#illusive-dnd-mobile-sheet-root .sheet-section {
  flex: 1 1 auto !important;
  width: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  height: auto !important;
  max-height: 100% !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  padding: 16px 16px 20px !important;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
#illusive-dnd-mobile-sheet-root .section-content {
  padding: 0 !important;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Match Amethyst header / stats breathing room */
#illusive-dnd-mobile-sheet-root .drawer-header {
  padding: 12px 16px 0 !important;
  overflow: visible !important;
}
#illusive-dnd-mobile-sheet-root .header-top {
  gap: 12px !important;
  margin-bottom: 12px !important;
  overflow: visible !important;
}
#illusive-dnd-mobile-sheet-root .drawer-header:has(.death-save-overlay) .header-top,
#illusive-dnd-mobile-sheet-root .drawer-header:has(.illusive-dnd-ms-death) .header-top {
  margin-bottom: 4px !important;
}
#illusive-dnd-mobile-sheet-root .header-avatar {
  width: 64px !important;
  height: 64px !important;
  object-fit: cover !important;
  object-position: top !important;
  border-radius: 50% !important;
}
#illusive-dnd-mobile-sheet-root .stats-row {
  gap: 8px !important;
  padding: 8px 16px !important;
  margin: 0 -16px 12px !important;
  height: auto !important;
  min-height: 0 !important;
}
#illusive-dnd-mobile-sheet-root .stat-box {
  padding: 10px 6px !important;
  height: auto !important;
  min-height: 4.25rem !important;
  width: auto !important;
  aspect-ratio: auto !important;
}
#illusive-dnd-mobile-sheet-root .abilities-grid {
  display: grid !important;
  grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
  gap: 1.2% !important;
  margin: 16px 0 !important;
}
#illusive-dnd-mobile-sheet-root .ability-card {
  min-height: 4.25rem !important;
  border-radius: 8px !important;
  min-width: 0 !important;
}
#illusive-dnd-mobile-sheet-root .ability-check-area {
  padding: 6px 0 !important;
  gap: 2px !important;
  min-height: 3.25rem !important;
}
#illusive-dnd-mobile-sheet-root .skills-list {
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
  margin-top: 8px !important;
}
#illusive-dnd-mobile-sheet-root .skill-roll-btn {
  min-height: 2.75rem !important;
  padding: 0.55rem 0.85rem !important;
  gap: 8px !important;
}
#illusive-dnd-mobile-sheet-root .skill-mod { margin-left: auto; font-weight: 700; }
#illusive-dnd-mobile-sheet-root .skill-ability {
  font-size: 0.7rem;
  opacity: 0.65;
  text-transform: uppercase;
}

/* Item rows — roomier Amethyst spacing; kill text squash */
#illusive-dnd-mobile-sheet-root .item-list {
  display: flex !important;
  flex-direction: column !important;
  gap: 6px !important;
}
#illusive-dnd-mobile-sheet-root .item-row {
  display: flex !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  margin-bottom: 0 !important;
  min-height: 3.5rem !important;
  height: auto !important;
  padding: 4px 0 !important;
  gap: 8px !important;
  overflow: visible !important;
  -webkit-mask-image: none !important;
  mask-image: none !important;
}
#illusive-dnd-mobile-sheet-root .item-row.is-dim { opacity: 0.45; }
#illusive-dnd-mobile-sheet-root .item-row.is-usable .item-img {
  cursor: pointer !important;
}
#illusive-dnd-mobile-sheet-root .item-row .item-img {
  width: 2.75rem !important;
  height: 2.75rem !important;
  margin: 6px !important;
  border-radius: 6px !important;
  flex-shrink: 0 !important;
  object-fit: cover !important;
}
#illusive-dnd-mobile-sheet-root .item-row .item-info,
#illusive-dnd-mobile-sheet-root .item-row button.item-info {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  max-width: none !important;
  height: auto !important;
  min-height: 3.25rem !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  justify-content: center !important;
  gap: 2px !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  padding: 8px 8px 8px 2px !important;
  margin: 0 !important;
  text-align: left !important;
  color: inherit !important;
  line-height: 1.3 !important;
  overflow: visible !important;
  white-space: normal !important;
  font-size: inherit !important;
  transform: none !important;
  writing-mode: horizontal-tb !important;
}
#illusive-dnd-mobile-sheet-root .item-row button.item-info:disabled {
  opacity: 1 !important;
  cursor: default !important;
}
#illusive-dnd-mobile-sheet-root .item-row.is-usable button.item-info:active {
  background: var(--mobile-bg-button-active, rgba(255,255,255,0.08)) !important;
}
#illusive-dnd-mobile-sheet-root .item-row .item-name {
  display: block !important;
  width: 100% !important;
  color: var(--mobile-text-primary, #ffffff) !important;
  font-size: 1rem !important;
  font-weight: 500 !important;
  line-height: 1.35 !important;
  max-height: none !important;
  height: auto !important;
  opacity: 1 !important;
  visibility: visible !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  transform: none !important;
  -webkit-text-size-adjust: 100% !important;
}
#illusive-dnd-mobile-sheet-root .item-row .item-quantity,
#illusive-dnd-mobile-sheet-root .item-row .item-uses {
  display: block !important;
  color: var(--mobile-text-secondary, #aaaaaa) !important;
  font-size: 0.85rem !important;
  line-height: 1.3 !important;
  max-height: none !important;
  height: auto !important;
  opacity: 1 !important;
  transform: none !important;
}
#illusive-dnd-mobile-sheet-root .item-row .item-actions {
  display: flex !important;
  gap: 4px !important;
  margin-right: 6px !important;
  flex: 0 0 auto !important;
}
#illusive-dnd-mobile-sheet-root .item-row .item-btn {
  width: 44px !important;
  height: 44px !important;
  min-width: 44px !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 8px !important;
  background: transparent !important;
  color: var(--mobile-text-secondary, #aaa) !important;
  cursor: pointer !important;
}
#illusive-dnd-mobile-sheet-root .item-row .item-btn:active {
  background: var(--mobile-bg-button-active, rgba(255,255,255,0.1)) !important;
}
#illusive-dnd-mobile-sheet-root .item-row .item-btn.equipped,
#illusive-dnd-mobile-sheet-root .item-row .equip-btn.equipped {
  color: var(--mobile-accent, #b794f6) !important;
}

#illusive-dnd-mobile-sheet-root .section-nav-track {
  padding: 10px 14px !important;
  gap: 6px !important;
}
#illusive-dnd-mobile-sheet-root .section-tab {
  padding: 10px 14px !important;
  min-height: 40px !important;
}

/* Init — clear tap target */
#illusive-dnd-mobile-sheet-root .stats-row .init-box {
  cursor: pointer !important;
  border: 1px solid var(--mobile-accent-50, rgba(183,148,246,0.5)) !important;
  background: var(--mobile-accent-10, rgba(183,148,246,0.12)) !important;
}
#illusive-dnd-mobile-sheet-root .stats-row .init-box:active {
  background: var(--mobile-accent-20, rgba(183,148,246,0.22)) !important;
}
#illusive-dnd-mobile-sheet-root .stats-row .init-box::before,
#illusive-dnd-mobile-sheet-root .stats-row .init-box::after {
  content: none !important;
  display: none !important;
}

#illusive-dnd-mobile-sheet-root .sheet-section {
  -webkit-mask-image: none !important;
  mask-image: none !important;
}

#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-rests {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 20px;
}
#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-rests:has(> :only-child) {
  grid-template-columns: 1fr;
}
#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-btn {
  border: 1px solid var(--mobile-border, rgba(255,255,255,0.12));
  background: var(--mobile-bg-button, rgba(255,255,255,0.06));
  color: var(--mobile-text-primary, #fff);
  border-radius: 8px;
  padding: 14px 16px;
  font-size: 0.95rem;
  font-weight: 600;
  min-height: 48px;
  cursor: pointer;
}
#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-btn:active {
  background: var(--mobile-bg-button-active, rgba(255,255,255,0.12));
}
#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 14px;
}
#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-chip {
  border-radius: 6px;
  padding: 6px 12px;
  background: var(--mobile-bg-secondary, rgba(255,255,255,0.05));
  border: 1px solid var(--mobile-border, rgba(255,255,255,0.1));
  font-size: 0.8rem;
  color: var(--mobile-text-secondary, #ccc);
}
#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-chip strong {
  color: var(--mobile-text-primary, #fff);
  font-weight: 600;
  margin-right: 4px;
}
#illusive-dnd-mobile-sheet-root .illusive-dnd-ms-section-title {
  margin: 14px 0 6px;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mobile-text-secondary, #aaa);
}
#illusive-dnd-mobile-sheet-root .empty-message {
  opacity: 0.65;
  color: var(--mobile-text-secondary, #aaa);
  padding: 16px 4px;
  font-size: 0.9rem;
}
#illusive-dnd-mobile-sheet-root .bio-text {
  font-size: 0.95rem;
  line-height: 1.45;
  color: var(--mobile-text-primary, #fff);
  margin-bottom: 10px;
}

#illusive-dnd-mobile-sheet-root .is-pressed { filter: brightness(1.12); }

/* ---- Grey out sheet while manual roller is open (do not close it) ---- */
body.illusive-dnd-mobile-roller-open #illusive-dnd-mobile-sheet-root {
  pointer-events: none !important;
}
body.illusive-dnd-mobile-roller-open #illusive-dnd-mobile-sheet-root .illusive-dnd-illusive-mobile-sheet.mobile-sheet-drawer {
  filter: grayscale(0.45) brightness(0.55) !important;
  opacity: 0.72 !important;
  transition: filter 0.15s ease, opacity 0.15s ease !important;
}
body.illusive-dnd-mobile-roller-open #illusive-dnd-mobile-sheet-root .drawer-content {
  pointer-events: none !important;
}

/* ---- Manual dice roller: fixed toggle + docked panel ---- */
#illusive-dnd-mobile-dice-roller {
  --illusive-dnd-dice-fab-size: 56px;
  --illusive-dnd-dice-fab-gap: 12px;
  position: fixed !important;
  inset: 0 !important;
  z-index: 100002 !important;
  pointer-events: none !important;
}
/* Left rail (.illusive-dnd-move-utils) is 100003 at the same left/bottom dock. */
#illusive-dnd-mobile-dice-roller.is-open {
  z-index: 100010 !important;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-toggle,
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-panel {
  pointer-events: auto !important;
}
/* Toggle stays bottom-right — panel never extends under it */
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-toggle {
  position: fixed !important;
  right: var(--illusive-dnd-dice-fab-gap) !important;
  bottom: calc(var(--illusive-dnd-carousel-dock, 96px) + 12px) !important;
  width: var(--illusive-dnd-dice-fab-size) !important;
  height: var(--illusive-dnd-dice-fab-size) !important;
  border-radius: 50% !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  background: rgba(22, 18, 32, 0.62) !important;
  color: #f4eefe !important;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28) !important;
  backdrop-filter: blur(18px) !important;
  font-size: 1.2rem !important;
  cursor: pointer !important;
  z-index: 100011 !important;
}
#illusive-dnd-mobile-dice-roller.is-open .illusive-dnd-dice-toggle,
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-toggle:active {
  border-color: var(--mobile-accent, #b794f6) !important;
  background: var(--mobile-bg-button-active, rgba(183,148,246,0.24)) !important;
  color: var(--mobile-accent, #b794f6) !important;
}
/* Panel left of FAB so Roll never overlaps the manual-roller button */
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-panel {
  position: fixed !important;
  left: 12px !important;
  right: auto !important;
  bottom: calc(var(--illusive-dnd-carousel-dock, 96px) + 12px) !important;
  z-index: 100010 !important;
  transform: none !important;
  width: min(420px, calc(100vw - 12px - var(--illusive-dnd-dice-fab-size) - var(--illusive-dnd-dice-fab-gap) * 2)) !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
  padding: 10px !important;
  border-radius: 12px !important;
  background: var(--mobile-bg-secondary, rgba(36, 36, 40, 0.97)) !important;
  border: 1px solid var(--mobile-border, rgba(255,255,255,0.14)) !important;
  box-shadow: 0 8px 28px rgba(0,0,0,0.55) !important;
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-panel[hidden] {
  display: none !important;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-command-row {
  display: flex !important;
  width: 100% !important;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-command {
  width: 100% !important;
  box-sizing: border-box !important;
  min-height: 44px !important;
  padding: 10px 12px !important;
  border-radius: 8px !important;
  border: 1px solid rgba(255,255,255,0.16) !important;
  background: rgba(20, 20, 24, 0.95) !important;
  color: #fff !important;
  font-size: 1rem !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-pad-row {
  display: grid !important;
  grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
  gap: 6px !important;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-btn {
  position: relative !important;
  aspect-ratio: 1 !important;
  min-height: 44px !important;
  border-radius: 8px !important;
  border: 1px solid var(--mobile-btn-border, rgba(255,255,255,0.14)) !important;
  background: var(--mobile-bg-button, rgba(48, 48, 54, 0.95)) !important;
  color: var(--mobile-text-primary, #fff) !important;
  font-size: 1.05rem !important;
  cursor: pointer !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-btn.is-selected {
  border-color: var(--mobile-accent, #b794f6) !important;
  color: var(--mobile-accent, #b794f6) !important;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-count {
  position: absolute !important;
  top: -6px !important;
  right: -4px !important;
  min-width: 16px !important;
  height: 16px !important;
  border-radius: 4px !important;
  background: var(--mobile-accent, #b794f6) !important;
  color: var(--mobile-page-bg, #111) !important;
  font-size: 0.65rem !important;
  font-weight: 700 !important;
  display: none !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 3px !important;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-count.is-visible { display: flex !important; }
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-mod-row {
  display: grid !important;
  grid-template-columns: 44px minmax(48px, 1fr) 44px 52px minmax(72px, 1.2fr) !important;
  gap: 6px !important;
  align-items: stretch !important;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-mod-btn,
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-mod-input,
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-adv,
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-roll-btn {
  min-height: 48px !important;
  border-radius: 8px !important;
  border: 1px solid var(--mobile-btn-border, rgba(255,255,255,0.14)) !important;
  background: var(--mobile-bg-button, rgba(48, 48, 54, 0.95)) !important;
  color: var(--mobile-text-primary, #fff) !important;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-mod-btn {
  font-size: 1.35rem !important;
  font-weight: 600 !important;
  cursor: pointer !important;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-mod-input {
  text-align: center !important;
  font-size: 1.1rem !important;
  font-weight: 600 !important;
  -moz-appearance: textfield;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-mod-input::-webkit-outer-spin-button,
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-mod-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-adv {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 0 !important;
  padding: 4px 2px !important;
  line-height: 1.05 !important;
  font-size: 0.62rem !important;
  font-weight: 700 !important;
  letter-spacing: 0.02em !important;
  cursor: pointer !important;
  opacity: 0.55 !important;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-adv.is-adv {
  opacity: 1 !important;
  border-color: #62d58a !important;
  color: #62d58a !important;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-adv.is-adv .illusive-dnd-dice-adv-bot { opacity: 0.35; }
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-adv.is-dis {
  opacity: 1 !important;
  border-color: #ef6b6b !important;
  color: #ef6b6b !important;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-adv.is-dis .illusive-dnd-dice-adv-top { opacity: 0.35; }
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-roll-btn {
  font-size: 1rem !important;
  font-weight: 700 !important;
  cursor: pointer !important;
  background: var(--mobile-btn-bg, rgba(58, 58, 66, 0.98)) !important;
}
#illusive-dnd-mobile-dice-roller .illusive-dnd-dice-roll-btn:active {
  background: var(--mobile-accent, #b794f6) !important;
  color: #111 !important;
}

/* ---- Closed-phone light / aura menus + target list ---- */
.illusive-dnd-ms-overlay.illusive-dnd-ms-controller-overlay,
.illusive-dnd-ms-overlay.illusive-dnd-ms-target-overlay {
  position: fixed !important;
  inset: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 16px !important;
  background: rgba(8, 6, 14, 0.72) !important;
}
.illusive-dnd-ms-overlay.illusive-dnd-ms-target-overlay .illusive-dnd-ms-target-dialog,
.illusive-dnd-ms-overlay.illusive-dnd-ms-controller-overlay .illusive-dnd-ms-settings-dialog {
  width: min(420px, 100%) !important;
  max-height: min(80vh, 720px) !important;
  overflow: auto !important;
  padding: 14px !important;
  border-radius: 16px !important;
  background: var(--mobile-bg-secondary, #1f1830) !important;
  border: 1px solid var(--mobile-border, rgba(183,148,246,0.28)) !important;
  box-shadow: 0 12px 40px var(--mobile-shadow-strong, rgba(0,0,0,0.55)) !important;
}
.illusive-dnd-ms-target-header,
.illusive-dnd-ms-controller-overlay .roll-dialog-header {
  display: flex !important;
  align-items: flex-start !important;
  justify-content: space-between !important;
  gap: 12px !important;
  margin-bottom: 10px !important;
}
.illusive-dnd-ms-target-header strong,
.illusive-dnd-ms-controller-overlay .roll-dialog-title {
  display: block !important;
  color: var(--mobile-text-primary, #fff) !important;
  font-size: 1.05rem !important;
}
.illusive-dnd-ms-target-progress,
.illusive-dnd-ms-target-hint {
  display: block !important;
  color: var(--mobile-text-secondary, #b9a9d4) !important;
  font-size: 0.85rem !important;
  margin: 0 0 10px !important;
}
.illusive-dnd-ms-target-list {
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
  max-height: 46vh !important;
  overflow: auto !important;
}
.illusive-dnd-ms-target-row {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  width: 100% !important;
  padding: 10px 12px !important;
  border-radius: 12px !important;
  border: 2px solid var(--mobile-btn-border, rgba(183,148,246,0.28)) !important;
  background: var(--mobile-bg-button, rgba(180,140,255,0.08)) !important;
  color: var(--mobile-text-primary, #fff) !important;
  text-align: left !important;
}
.illusive-dnd-ms-target-row img {
  width: 40px !important;
  height: 40px !important;
  border-radius: 50% !important;
  object-fit: cover !important;
}
.illusive-dnd-ms-target-name { flex: 1 !important; font-weight: 700 !important; }
.illusive-dnd-ms-target-row small { color: var(--mobile-text-secondary, #b9a9d4) !important; }
.illusive-dnd-ms-target-row.is-marked {
  border-color: var(--mobile-accent, #b794f6) !important;
  background: var(--mobile-bg-button-active, rgba(180,140,255,0.18)) !important;
}
.illusive-dnd-ms-target-actions,
.illusive-dnd-ms-controller-overlay .illusive-dnd-ms-dsn-actions {
  display: flex !important;
  gap: 8px !important;
  margin-top: 12px !important;
}
.illusive-dnd-ms-target-actions .roll-btn,
.illusive-dnd-ms-controller-overlay .roll-btn {
  flex: 1 !important;
  min-height: 48px !important;
}
.illusive-dnd-ms-aura-slots,
.illusive-dnd-ms-aura-actions {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  align-items: stretch !important;
  gap: 8px !important;
  min-height: 64px !important;
  margin: 0 0 12px !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-aura-slots > button.illusive-dnd-ms-settings-item,
.illusive-dnd-ms-overlay .illusive-dnd-ms-aura-actions > button.illusive-dnd-ms-settings-item {
  width: auto !important;
  flex: 1 1 0 !important;
  min-width: 0 !important;
}
.illusive-dnd-ms-overlay label.illusive-dnd-ms-aura-feet {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  box-sizing: border-box !important;
  width: 100% !important;
  margin: 0 0 12px !important;
  padding: 0 16px !important;
  min-height: 64px !important;
  border-radius: 14px !important;
  border: 1px solid var(--mobile-border, rgba(183,148,246,0.28)) !important;
  background: var(--mobile-bg-button, rgba(183,148,246,0.08)) !important;
  color: var(--mobile-text-primary, #fff) !important;
}
.illusive-dnd-ms-overlay label.illusive-dnd-ms-aura-feet input {
  flex: 1 1 auto !important;
  width: 100% !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  outline: none !important;
  background: transparent !important;
  color: inherit !important;
  font-size: 1.05rem !important;
  font-weight: 700 !important;
  line-height: 1.2 !important;
}
.illusive-dnd-ms-overlay label.illusive-dnd-ms-aura-feet span {
  flex: 0 0 auto !important;
  font-size: 1.05rem !important;
  font-weight: 700 !important;
}
.illusive-dnd-ms-aura-swatches {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
  margin-top: 12px !important;
  align-items: center !important;
}
/* Beat Foundry button width/flex and settings-item span flex. */
.illusive-dnd-ms-overlay button.illusive-dnd-ms-aura-swatch {
  box-sizing: border-box !important;
  display: inline-block !important;
  flex: 0 0 36px !important;
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  max-width: 36px !important;
  min-height: 36px !important;
  max-height: 36px !important;
  padding: 0 !important;
  margin: 0 !important;
  aspect-ratio: 1 !important;
  border-radius: 50% !important;
  border: 2px solid rgba(255,255,255,0.2) !important;
  background: var(--illusive-dnd-aura-swatch, #e07020) !important;
}
.illusive-dnd-ms-overlay button.illusive-dnd-ms-aura-swatch.is-active {
  border-color: #fff !important;
  box-shadow: 0 0 0 2px var(--mobile-accent, #b794f6) !important;
}
.illusive-dnd-ms-overlay .illusive-dnd-ms-settings-item span.illusive-dnd-ms-aura-dot {
  display: block !important;
  box-sizing: border-box !important;
  flex: 0 0 18px !important;
  width: 18px !important;
  height: 18px !important;
  min-width: 18px !important;
  max-width: 18px !important;
  min-height: 18px !important;
  max-height: 18px !important;
  padding: 0 !important;
  aspect-ratio: 1 !important;
  border-radius: 50% !important;
  border: 2px solid rgba(255,255,255,0.2) !important;
  background: var(--illusive-dnd-aura-swatch, #e07020) !important;
}
.illusive-dnd-ms-controller-overlay .roll-dialog-title,
.illusive-dnd-ms-controller-overlay .illusive-dnd-ms-settings-item,
.illusive-dnd-ms-controller-overlay .illusive-dnd-ms-settings-item strong {
  text-transform: none !important;
  letter-spacing: normal !important;
}
.illusive-dnd-ms-controller-overlay .roll-dialog-title::before,
.illusive-dnd-ms-controller-overlay .roll-dialog-title::after,
.illusive-dnd-ms-controller-overlay .illusive-dnd-ms-settings-item::before,
.illusive-dnd-ms-controller-overlay .illusive-dnd-ms-settings-item::after,
.illusive-dnd-ms-controller-overlay .illusive-dnd-ms-settings-item *::before,
.illusive-dnd-ms-controller-overlay .illusive-dnd-ms-settings-item *::after {
  content: none !important;
  display: none !important;
}
.illusive-dnd-ms-controller-overlay .illusive-dnd-ms-settings-item {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
}
.illusive-dnd-ms-controller-overlay .illusive-dnd-ms-settings-item img {
  width: 28px !important;
  height: 28px !important;
  border-radius: 6px !important;
  object-fit: cover !important;
}
`;

const STYLE_ID = "illusive-dnd-mobile-sheet-critical-css";
const AMETHYST_LINK_ID = "illusive-dnd-amethyst-sheet-css";
const AMETHYST_HREF = "modules/illusive-dnd-5e/src/hud/components/mobile-sheet/amethyst-sheet.css";

let sheetCssReady = false;
let accentApplied = false;

export function ensureMobileSheetStyles() {
  let link = document.getElementById(AMETHYST_LINK_ID);
  if (!link) {
    link = document.createElement("link");
    link.id = AMETHYST_LINK_ID;
    link.rel = "stylesheet";
    link.href = AMETHYST_HREF;
    document.head.appendChild(link);
  }

  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
    sheetCssReady = false;
  }
  if (!sheetCssReady) {
    el.textContent = MOBILE_SHEET_CRITICAL_CSS;
    sheetCssReady = true;
  }

  if (accentApplied || !globalThis.game?.settings) return;
  accentApplied = true;
  import("./mobile-accent.mjs")
    .then((m) => m.applyMobileAccentColor())
    .catch(() => { accentApplied = false; });
}
