import { settingOn } from "../../lib/hud-settings.mjs";
import { applyActorPortrait, applyPortraitSrc } from "../../lib/portrait-thumb.mjs";

function applyCardState(card, data) {
	card.style.order = data.order;
	card.hidden = data.hidden;
	card.title = data.name;
	card.classList.toggle("is-active", data.isActive);
	card.classList.toggle("is-defeated", Boolean(data.markedDefeated));
	card.classList.toggle("is-death-saving", Boolean(data.isDeathSaving));
	card.classList.toggle("is-dead", Boolean(data.isDead));
	card.classList.toggle("is-stabilized", Boolean(data.isStabilized));
	card.classList.toggle("is-secret", data.secret);
	card.classList.toggle("illusive-dnd-turn-card-event", data.isEvent);
	card.classList.toggle("illusive-dnd-turn-card-group", Boolean(data.isGroup));

	if (data.showHp) {
		card.dataset.hpTier = data.hp?.tier ?? "healthy";
	} else {
		delete card.dataset.hpTier;
	}

	if (data.showDamageWash && data.washPctCss) {
		card.style.setProperty("--illusive-dnd-hp-pct", data.washPctCss);
	} else {
		card.style.removeProperty("--illusive-dnd-hp-pct");
	}
}

function updateVitalityIcon(portrait, vitalityIcon) {
	if (!portrait) return;

	let icon = portrait.querySelector(".illusive-dnd-turn-vitality-icon");

	if (!vitalityIcon) {
		icon?.remove();
		return;
	}

	if (!icon) {
		icon = document.createElement("span");
		icon.className = "illusive-dnd-turn-vitality-icon";
		portrait.appendChild(icon);
	}

	icon.title = vitalityIcon.label ?? "";
	icon.setAttribute("aria-label", vitalityIcon.label ?? "");
	icon.innerHTML = `<i class="fas ${vitalityIcon.icon}" aria-hidden="true"></i>`;
}

function updateDamageWash(portrait, showDamageWash) {
	if (!portrait) return;

	let wash = portrait.querySelector(".illusive-dnd-turn-damage-wash");
	if (!showDamageWash) {
		wash?.remove();
		return;
	}

	if (!wash) {
		wash = document.createElement("span");
		wash.className = "illusive-dnd-turn-damage-wash";
		wash.setAttribute("aria-hidden", "true");
		portrait.appendChild(wash);
	}
}

function applyCardPortrait(card, data) {
	const portrait = card.querySelector(".illusive-dnd-turn-portrait");
	if (portrait) {
		let img = portrait.querySelector(".illusive-dnd-turn-portrait-img");
		if (!img) {
			img = document.createElement("img");
			img.className = "illusive-dnd-turn-portrait-img";
			img.alt = "";
			img.setAttribute("aria-hidden", "true");
			portrait.prepend(img);
		}
		if (data.isEvent) {
			applyPortraitSrc(img, data.img || "", data.name || "", { crop: "top" });
		} else {
			const actor = data.actorId ? game.actors.get(data.actorId) : null;
			applyActorPortrait(img, actor, { alt: data.name || "", fallbackSrc: data.img || "" });
		}
	}

	updateDamageWash(portrait, Boolean(data.showDamageWash));
	updateVitalityIcon(portrait, data.vitalityIcon ?? null);

	if (data.isGroup) {
		const count = card.querySelector(".illusive-dnd-turn-group-count");
		if (count) count.innerHTML = `<i class="fas fa-users"></i>${data.count}`;
	}
}

function applyCardInitiative(card, data) {
	const init = card.querySelector(".illusive-dnd-turn-init");
	if (!init) return;

	if (data.canRollInitiative) {
		init.classList.add("illusive-dnd-turn-init-roll");
		init.dataset.action = "roll-initiative";
		if (!init.querySelector("i")) init.innerHTML = '<i class="fas fa-dice-d20"></i>';
		return;
	}

	init.classList.remove("illusive-dnd-turn-init-roll");
	delete init.dataset.action;
	init.textContent = data.hasRolled ? data.initiative : "—";
}

function applyCardHp(card, data) {
	const hp = card.querySelector(".illusive-dnd-turn-hp");
	if (!hp) return;

	hp.textContent = `${data.hp.value}/${data.hp.max}`;
	hp.hidden = !data.showHp || !settingOn("showTurnCardHpNumbers");
}

function applyCardName(card, data) {
	const name = card.querySelector(".illusive-dnd-turn-name");
	if (!name) return;

	name.textContent = data.isEvent && data.roundsLeft != null
		? `${data.name} |${data.roundsLeft}`
		: data.name;
}

/** Patch one combatant card in place (no re-template). */
export function updateCardElement(card, data) {
	applyCardState(card, data);
	applyCardPortrait(card, data);
	applyCardInitiative(card, data);
	applyCardHp(card, data);
	applyCardName(card, data);
}
