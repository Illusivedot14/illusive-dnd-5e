/** Static markup for the turn tracker dock (carousel + GM controls). */
export const TURN_TRACKER_SHELL = `
<div class="illusive-dnd-turn-dock">
	<div class="illusive-dnd-turn-controls illusive-dnd-turn-controls-left" data-illusive-dnd-controls="gm">
		<button type="button" class="illusive-dnd-turn-btn" data-action="previous-encounter" data-illusive-dnd-encounter hidden data-tooltip="Previous Encounter" aria-label="Previous Encounter">
			<i class="fas fa-caret-up"></i>
		</button>
		<button type="button" class="illusive-dnd-turn-btn" data-action="end-combat" data-tooltip="COMBAT.End" aria-label="End Combat">
			<i class="fas fa-ban"></i>
		</button>
		<button type="button" class="illusive-dnd-turn-btn" data-action="game-log" data-tooltip="Game log" aria-label="Game log">
			<i class="fas fa-scroll"></i>
		</button>
		<button type="button" class="illusive-dnd-turn-btn" data-action="roll-all" data-illusive-dnd-initiative-btn data-tooltip="Roll remaining initiative" aria-label="Roll remaining initiative">
			<i class="fas fa-dice-d20"></i>
		</button>
		<button type="button" class="illusive-dnd-turn-btn" data-action="previous-turn" data-tooltip="COMBAT.TurnPrev" aria-label="Previous Turn">
			<i class="fas fa-chevron-left"></i>
		</button>
		<button type="button" class="illusive-dnd-turn-btn" data-action="previous-round" data-tooltip="COMBAT.RoundPrev" aria-label="Previous Round">
			<i class="fas fa-chevrons-left"></i>
		</button>
	</div>

	<div class="illusive-dnd-turn-carousel">
		<div class="illusive-dnd-turn-motion">
			<div id="illusive-dnd-turn-tracker-track"></div>
			<input type="range" class="illusive-dnd-turn-scroll-slider" min="0" max="1000" value="0" hidden aria-label="Scroll turn tracker">
		</div>
		<button
			type="button"
			class="illusive-dnd-turn-btn illusive-dnd-turn-minimize"
			data-action="toggle-minimize"
			aria-label="Minimize turn tracker"
			data-tooltip="Minimize turn tracker"
		>
			<i class="fas fa-chevron-up" aria-hidden="true"></i>
		</button>
	</div>

	<div class="illusive-dnd-turn-controls illusive-dnd-turn-controls-right" data-illusive-dnd-controls="gm">
		<button type="button" class="illusive-dnd-turn-btn" data-action="start-combat" data-tooltip="COMBAT.Begin" aria-label="Begin Combat">
			<i class="fas fa-play"></i>
		</button>
		<button type="button" class="illusive-dnd-turn-btn" data-action="configure" data-tooltip="COMBAT.Settings" aria-label="Combat Settings">
			<i class="fas fa-cog"></i>
		</button>
		<button type="button" class="illusive-dnd-turn-btn" data-action="add-event" data-tooltip="Add Combat Event" aria-label="Add Combat Event">
			<i class="fas fa-globe"></i>
		</button>
		<button type="button" class="illusive-dnd-turn-btn" data-action="next-turn" data-tooltip="COMBAT.TurnNext" aria-label="Next Turn">
			<i class="fas fa-chevron-right"></i>
		</button>
		<button type="button" class="illusive-dnd-turn-btn" data-action="next-round" data-tooltip="COMBAT.RoundNext" aria-label="Next Round">
			<i class="fas fa-chevrons-right"></i>
		</button>
		<button type="button" class="illusive-dnd-turn-btn" data-action="next-encounter" data-illusive-dnd-encounter hidden data-tooltip="Next Encounter" aria-label="Next Encounter">
			<i class="fas fa-caret-down"></i>
		</button>
	</div>
</div>
`;
