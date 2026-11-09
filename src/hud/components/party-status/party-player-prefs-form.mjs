import { MODULE_PATH } from "../../../constants.mjs";
import { illusiveDnd } from "../../../i18n/index.mjs";
import {
	getGmPartyDefaults,
	readPartyPlayerPrefs,
	resetPartyPlayerPrefs,
	updatePartyPlayerPrefs
} from "../../lib/party-player-prefs.mjs";

export class PartyPlayerPrefsForm extends FormApplication {
	constructor({ mode = "rail" } = {}, options = {}) {
		super({}, options);
		this._mode = mode === "myCard" ? "rail" : mode;
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["illusive-dnd-party-player-prefs"],
			width: 480,
			height: "auto",
			closeOnSubmit: true
		});
	}

	get title() {
		return illusiveDnd.partyPlayerPrefs("railTitle");
	}

	get template() {
		return `${MODULE_PATH}/src/hud/templates/party-player-prefs.hbs`;
	}

	getData() {
		const gm = getGmPartyDefaults();
		const prefs = readPartyPlayerPrefs();
		const rail = prefs.rail ?? {};

		return {
			rail: {
				offsetX: rail.offsetX ?? gm.offsetX,
				offsetY: rail.offsetY ?? gm.offsetY,
				scale: rail.scale ?? gm.scale,
				minimized: rail.minimized ?? false
			},
			railSectionLabel: illusiveDnd.partyPlayerPrefs("railSection"),
			railSectionHint: illusiveDnd.partyPlayerPrefs("railSectionHint"),
			offsetXLabel: illusiveDnd.partyPlayerPrefs("offsetX"),
			offsetXHint: illusiveDnd.partyPlayerPrefs("offsetXHint", { value: gm.offsetX }),
			offsetYLabel: illusiveDnd.partyPlayerPrefs("offsetY"),
			offsetYHint: illusiveDnd.partyPlayerPrefs("offsetYHint", { value: gm.offsetY }),
			scaleLabel: illusiveDnd.partyPlayerPrefs("scale"),
			scaleHint: illusiveDnd.partyPlayerPrefs("scaleHint", { value: gm.scale }),
			minimizedLabel: illusiveDnd.partyPlayerPrefs("minimized"),
			minimizedHint: illusiveDnd.partyPlayerPrefs("minimizedHint"),
			resetLabel: illusiveDnd.partyPlayerPrefs("reset"),
			saveLabel: illusiveDnd.partyPlayerPrefs("save")
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		html.find('input[type="range"]').on("input", (event) => {
			const output = event.target.nextElementSibling;
			if (output?.classList.contains("range-value")) output.textContent = event.target.value;
		});
		html.find('[data-action="reset"]').on("click", (event) => {
			event.preventDefault();
			void resetPartyPlayerPrefs("rail").then(() => this.render(false));
		});
	}

	async _updateObject(_event, formData) {
		const gm = getGmPartyDefaults();
		const prefs = readPartyPlayerPrefs();
		const rail = { ...(prefs.rail ?? {}) };

		const offsetX = Number(formData.railOffsetX);
		const offsetY = Number(formData.railOffsetY);
		const scale = Number(formData.railScale);

		if (offsetX === gm.offsetX) delete rail.offsetX;
		else rail.offsetX = offsetX;

		if (offsetY === gm.offsetY) delete rail.offsetY;
		else rail.offsetY = offsetY;

		if (scale === gm.scale) delete rail.scale;
		else rail.scale = scale;

		rail.minimized = Boolean(formData.railMinimized);

		await updatePartyPlayerPrefs({ rail });
	}
}

export function openPartyPlayerPrefsForm(mode = "rail") {
	return new PartyPlayerPrefsForm({ mode }).render(true);
}
