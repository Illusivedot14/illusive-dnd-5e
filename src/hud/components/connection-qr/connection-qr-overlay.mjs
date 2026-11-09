import { MODULE_ID } from "../../../constants.mjs";

const SOCKET = `module.${MODULE_ID}`;
const MSG = "connection-qr";
const SETTING = "connectionQrPulse";
const FLAG = "connectionQr";
const OVERLAY_ID = "illusive-dnd-connection-qr-overlay";
const AUTO_MS = 30_000;

const FOUNDRY_QR = "assets/qr/foundry-port.png";
const WIFI_QR = "assets/qr/guest-wifi.png";

let autoTimer = null;
let bound = false;
let lockViewForced = false;
let activeAt = 0;

function route(path) {
	try {
		return foundry.utils.getRoute(path);
	} catch {
		return path;
	}
}

function readPulse() {
	try {
		return game.settings.get(MODULE_ID, SETTING) ?? { show: false, targetId: null, at: 0 };
	} catch {
		return { show: false, targetId: null, at: 0 };
	}
}

async function writePulse(pulse) {
	await game.settings.set(MODULE_ID, SETTING, pulse);
}

/** Lock View hides Foundry chrome on the TV — force it visible while QRs are up. */
function setLockViewBypass(enable) {
	try {
		const sh = globalThis.lockView?.sceneHandler;
		if (!sh) return;
		if (enable) {
			if (sh.forceUi) return;
			sh.forceUi = true;
			lockViewForced = true;
			sh.setUiElements?.(canvas?.scene, "forceShowUi");
		} else if (lockViewForced) {
			sh.forceUi = false;
			lockViewForced = false;
			sh.setUiElements?.(canvas?.scene, "canvasReady");
		}
	} catch (err) {
		console.warn(`${MODULE_ID} | Lock View bypass failed`, err);
	}
}

function clearAutoTimer() {
	if (autoTimer) {
		clearTimeout(autoTimer);
		autoTimer = null;
	}
}

function removeOverlayLocal() {
	clearAutoTimer();
	document.getElementById(OVERLAY_ID)?.remove();
	setLockViewBypass(false);
}

function showOverlayLocal({ userName } = {}) {
	removeOverlayLocal();
	setLockViewBypass(true);

	const el = document.createElement("div");
	el.id = OVERLAY_ID;
	el.setAttribute("data-illusive-dnd-cqr", "1");
	el.innerHTML = `
		<style>
			#${OVERLAY_ID} {
				position: fixed !important;
				inset: 0 !important;
				z-index: 2147483647 !important;
				display: flex !important;
				visibility: visible !important;
				opacity: 1 !important;
				align-items: center;
				justify-content: center;
				background: rgba(0, 0, 0, 0.78);
				cursor: pointer;
				padding: 24px;
				box-sizing: border-box;
				pointer-events: auto !important;
			}
			#${OVERLAY_ID} .illusive-dnd-cqr-panel {
				display: flex;
				flex-wrap: wrap;
				gap: 40px;
				align-items: flex-end;
				justify-content: center;
				max-width: min(960px, 100%);
				pointer-events: none;
			}
			#${OVERLAY_ID} .illusive-dnd-cqr-card {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 14px;
			}
			#${OVERLAY_ID} img {
				width: min(280px, 38vw);
				height: auto;
				aspect-ratio: 1;
				object-fit: contain;
				background: #fff;
				border-radius: 12px;
				padding: 12px;
				box-shadow: 0 8px 32px rgba(0,0,0,0.45);
			}
			#${OVERLAY_ID} .illusive-dnd-cqr-label {
				color: #f0ddb0;
				font-size: clamp(18px, 2.4vw, 28px);
				font-weight: 700;
				text-shadow: 0 2px 8px rgba(0,0,0,0.9);
			}
			#${OVERLAY_ID} .illusive-dnd-cqr-hint {
				position: absolute;
				bottom: 28px;
				left: 50%;
				transform: translateX(-50%);
				color: rgba(255,255,255,0.75);
				font-size: 14px;
				text-align: center;
				pointer-events: none;
			}
		</style>
		<div class="illusive-dnd-cqr-panel">
			<div class="illusive-dnd-cqr-card">
				<img src="${route(FOUNDRY_QR)}" alt="Foundry" draggable="false">
				<div class="illusive-dnd-cqr-label">Foundry</div>
			</div>
			<div class="illusive-dnd-cqr-card">
				<img src="${route(WIFI_QR)}" alt="Guest Wi-Fi" draggable="false">
				<div class="illusive-dnd-cqr-label">Guest Wi-Fi</div>
			</div>
		</div>
		<div class="illusive-dnd-cqr-hint">Tap to dismiss · auto-hides in 30s${userName ? ` · ${foundry.utils.escapeHTML(userName)}` : ""}</div>
	`;

	el.addEventListener("click", () => { void dismissEverywhere(); });
	// documentElement sits above Lock View–hidden #interface chrome.
	document.documentElement.appendChild(el);
	autoTimer = setTimeout(() => { void dismissEverywhere(); }, AUTO_MS);
	console.info(`${MODULE_ID} | connection QR overlay shown`, { userName, userId: game.user.id });
}

function applyPulse(pulse) {
	const show = pulse?.show === true && pulse?.targetId;
	const forMe = show && pulse.targetId === game.user.id;

	if (forMe) {
		activeAt = pulse.at ?? Date.now();
		const name = game.users.get(pulse.targetId)?.name;
		showOverlayLocal({ userName: name });
		return;
	}

	removeOverlayLocal();
}

async function dismissEverywhere() {
	const at = activeAt;
	removeOverlayLocal();
	game.socket.emit(SOCKET, { type: MSG, action: "hide" });
	if (game.user.isGM) {
		await writePulse({ show: false, targetId: null, at: Date.now() });
	} else {
		game.socket.emit(SOCKET, { type: MSG, action: "request-hide", at });
	}
}

function onSocket(data) {
	if (!data || data.type !== MSG) return;

	if (data.action === "hide") {
		removeOverlayLocal();
		return;
	}

	if (data.action === "request-hide") {
		if (!game.user.isGM) return;
		void writePulse({ show: false, targetId: null, at: Date.now() });
		return;
	}

	if (data.action === "show") {
		applyPulse({ show: true, targetId: data.targetId, at: data.at });
	}
}

/** Whisper chat always reaches the target client (and GM). */
function onCreateChatMessage(message) {
	const pulse = message.getFlag?.(MODULE_ID, FLAG);
	if (!pulse?.show || !pulse?.targetId) return;

	if (game.user.id === pulse.targetId) {
		applyPulse(pulse);
	}

	// GM cleans the whisper so chat stays empty.
	if (game.user.isGM) {
		window.setTimeout(() => {
			void message.delete().catch(() => undefined);
		}, 250);
	}
}

async function pickPlayer() {
	const users = game.users.filter((u) => !u.isGM);
	if (!users.length) {
		ui.notifications.warn("No player users exist.");
		return null;
	}

	const activeFirst = [...users].sort((a, b) => Number(b.active) - Number(a.active));
	const options = activeFirst
		.map((u) => {
			const label = `${foundry.utils.escapeHTML(u.name)}${u.active ? "" : " (offline)"}`;
			return `<option value="${u.id}">${label}</option>`;
		})
		.join("");

	const userId = await foundry.applications.api.DialogV2.prompt({
		window: { title: "Show connection QRs to…", icon: "fas fa-qrcode" },
		content: `<p>Only that player sees the QRs. Lock View is bypassed while they are up.</p>
			<div class="form-group">
				<label>Player</label>
				<div class="form-fields"><select name="userId">${options}</select></div>
			</div>`,
		rejectClose: false,
		ok: {
			label: "Show",
			callback: (_event, button) => button.form.elements.userId.value
		}
	});

	return userId || null;
}

/** GM entry: pick a player → overlay ONLY on their client. */
export async function showConnectionQrs() {
	if (!game.user.isGM) {
		ui.notifications.warn("GM only.");
		return;
	}

	const userId = await pickPlayer();
	if (!userId) return;

	const user = game.users.get(userId);
	if (!user) {
		ui.notifications.warn("User not found.");
		return;
	}
	if (!user.active) {
		ui.notifications.warn(`${user.name} is offline — they must be logged into Foundry.`);
		return;
	}

	const pulse = { show: true, targetId: user.id, at: Date.now() };

	// 1) Whisper — Foundry delivers this to that client for sure.
	await ChatMessage.create({
		content: `<p>Connection QRs → <strong>${foundry.utils.escapeHTML(user.name)}</strong></p>`,
		whisper: [user.id],
		speaker: { alias: "Connection QRs" },
		flags: { [MODULE_ID]: { [FLAG]: pulse } }
	});

	// 2) World setting + socket as backups.
	await writePulse(pulse);
	game.socket.emit(SOCKET, { type: MSG, action: "show", targetId: user.id, at: pulse.at });

	removeOverlayLocal();
	ui.notifications.info(`QRs sent to ${user.name} only (Lock View bypassed on their client).`);

	window.setTimeout(() => {
		const cur = readPulse();
		if (cur?.show && cur.targetId === user.id && cur.at === pulse.at) {
			void writePulse({ show: false, targetId: null, at: Date.now() });
		}
	}, AUTO_MS);
}

/** Delete ALL tiles on the current scene. */
export async function purgeConnectionQrTiles() {
	if (!game.user.isGM) {
		ui.notifications.warn("GM only.");
		return;
	}
	const scene = canvas?.scene;
	if (!scene) {
		ui.notifications.warn("Open a scene first.");
		return;
	}
	const ids = scene.tiles.map((t) => t.id);
	if (!ids.length) {
		ui.notifications.info("No tiles on this scene.");
		return;
	}
	await scene.deleteEmbeddedDocuments("Tile", ids);
	ui.notifications.info(`Deleted ${ids.length} tile(s).`);
}

export function bindConnectionQrOverlay() {
	if (bound) return;
	bound = true;
	game.socket.on(SOCKET, onSocket);
	Hooks.on("updateSetting", (setting) => {
		if (setting.key !== `${MODULE_ID}.${SETTING}`) return;
		applyPulse(setting.value ?? readPulse());
	});
	Hooks.on("createChatMessage", (message) => onCreateChatMessage(message));
	applyPulse(readPulse());
}
