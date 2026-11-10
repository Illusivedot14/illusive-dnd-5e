import { MODULE_ID } from "../constants.mjs";

const SOCKET_EVENT = `module.${MODULE_ID}`;
export const TABLETOP_SOCKET_TYPE = "tabletop-camera";

let bound = false;
let onMessage = null;

export function emitTabletop(payload) {
  if (typeof game?.socket?.emit !== "function") return false;
  game.socket.emit(SOCKET_EVENT, {
    type: TABLETOP_SOCKET_TYPE,
    fromUserId: game.user?.id ?? null,
    ...payload
  });
  return true;
}

export function senderOf(data) {
  if (!data?.fromUserId) return null;
  return game.users?.get?.(data.fromUserId) ?? null;
}

export function bindTabletopSocket(handler) {
  onMessage = handler;
  if (bound || typeof game?.socket?.on !== "function") return;
  bound = true;
  game.socket.on(SOCKET_EVENT, (data) => {
    if (!data || data.type !== TABLETOP_SOCKET_TYPE) return;
    if (data.fromUserId && data.fromUserId === game.user?.id) return;
    onMessage?.(data);
  });
}
