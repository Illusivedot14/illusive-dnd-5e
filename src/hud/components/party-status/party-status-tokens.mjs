/** Player-owned character tokens visible on the current scene. */
export function getPartyTokens() {
	if (!canvas?.ready) return [];
	const pool = canvas.tokens?.placeables ?? canvas.tokens?.contents ?? [];

	return pool.filter((token) => {
		const actor = token.actor;
		return (
			actor?.type === "character" &&
			actor.hasPlayerOwner &&
			!token.document?.hidden
		);
	});
}
