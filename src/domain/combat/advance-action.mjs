/**
 * Pure combat state transitions.
 * Dice and document writes are returned as commands; never executed here.
 */

import { ACTION_PHASES, appendTrace, isTerminalPhase } from "./action-state.mjs";

function withTargets(state, targetUuids) {
  if (!Array.isArray(targetUuids)) return state.targets;
  return targetUuids.map((uuid) => {
    const prior = state.targets?.find((t) => t.uuid === uuid);
    return prior ?? { uuid, outcome: null };
  });
}

/**
 * @param {object} state
 * @param {{ type: string, [key: string]: unknown }} event
 * @param {object} [rulesContext]
 */
export function advanceAction(state, event, rulesContext = state?.rulesContext) {
  const type = event?.type;

  if (!state) {
    return {
      state,
      commands: [],
      traceEntries: [{ type: "ignored", reason: "missing-state", eventType: type }]
    };
  }
  if (isTerminalPhase(state.phase) && type !== "correct") {
    return {
      state,
      commands: [],
      traceEntries: [{ type: "ignored", reason: "terminal-or-missing", eventType: type }]
    };
  }
  if (state.phase === "corrected" && type === "correct") {
    return {
      state,
      commands: [],
      traceEntries: [{ type: "ignored", reason: "already-corrected", eventType: type }]
    };
  }

  let next = { ...state, rulesContext: rulesContext ?? state.rulesContext };
  const commands = [];
  const traceEntries = [];

  switch (type) {
    case "start": {
      next = {
        ...next,
        phase: "awaiting-attack",
        targets: withTargets(next, event.targetUuids)
      };
      commands.push({
        id: `use:${next.id}`,
        type: "useActivity",
        payload: {
          actorUuid: next.actorUuid,
          itemUuid: next.itemUuid,
          activityId: next.activityId,
          targetUuids: event.targetUuids ?? [],
          useOptions: event.useOptions ?? {},
          event: event.domEvent ?? null
        }
      });
      traceEntries.push({
        type: "phase",
        phase: next.phase,
        rule: "combat.activity-use",
        detail: "Activity launched"
      });
      break;
    }

    case "awaitReaction": {
      // Allowed from created / awaiting-attack / awaiting-damage-or-save / ready-to-apply
      // Also allow re-entry while already awaiting-reaction (multi-reactor hard queue).
      if (!["created", "awaiting-attack", "awaiting-damage-or-save", "ready-to-apply", "awaiting-reaction"].includes(next.phase)) {
        traceEntries.push({ type: "ignored", reason: "bad-phase-for-reaction", phase: next.phase });
        break;
      }
      const resumePhase = event.resumePhase
        ?? event.options?.resumePhase
        ?? (next.phase !== "awaiting-reaction" ? next.phase : (next.reactionWindow?.resumePhase ?? "awaiting-damage-or-save"));
      const windowId = event.windowId ?? event.options?.windowId ?? null;
      const mode = event.mode ?? event.options?.mode ?? null;
      next = {
        ...next,
        phase: "awaiting-reaction",
        pendingDecision: {
          type: "reaction",
          actorUuid: event.actorUuid ?? null,
          trigger: event.trigger ?? "reaction",
          options: {
            ...(event.options ?? {}),
            resumePhase,
            windowId,
            mode,
            triggerId: event.triggerId ?? event.options?.triggerId ?? null
          },
          timeoutMs: event.timeoutMs ?? 12000
        },
        reactionWindow: {
          windowId,
          mode,
          resumePhase,
          triggerId: event.triggerId ?? event.options?.triggerId ?? null,
          patches: Array.isArray(event.patches) ? event.patches : (next.reactionWindow?.patches ?? [])
        }
      };
      traceEntries.push({
        type: "phase",
        phase: next.phase,
        rule: "combat.economy.reaction",
        detail: windowId ? `Waiting for reaction (${windowId})` : "Waiting for reaction"
      });
      break;
    }

    case "reactionResolved": {
      const resume = event.nextPhase
        ?? next.reactionWindow?.resumePhase
        ?? next.pendingDecision?.options?.resumePhase
        ?? "awaiting-damage-or-save";
      const patches = Array.isArray(event.patches)
        ? event.patches
        : (next.reactionWindow?.patches ?? []);
      next = {
        ...next,
        phase: resume,
        pendingDecision: null,
        reactionWindow: event.clearWindow === false
          ? { ...(next.reactionWindow ?? {}), patches }
          : null,
        reactionPatches: patches
      };
      traceEntries.push({
        type: "decision",
        phase: next.phase,
        rule: "combat.economy.reaction",
        detail: event.summary ?? (event.used ? "Reaction used" : "Reaction passed")
      });
      break;
    }

    case "attackRolled": {
      const rolls = [...(next.rolls ?? []), ...(event.rolls ?? [])];
      next = {
        ...next,
        phase: next.phase === "awaiting-attack" ? "awaiting-damage-or-save" : next.phase,
        rolls
      };
      traceEntries.push({
        type: "roll",
        kind: "attack",
        rule: "combat.activity-use",
        detail: event.summary ?? "Attack roll recorded"
      });
      break;
    }

    case "saveRolled": {
      const rolls = [...(next.rolls ?? []), ...(event.rolls ?? [])];
      const targets = Array.isArray(event.outcomes)
        ? (next.targets ?? []).map((t) => {
            const outcome = event.outcomes.find((o) => o.uuid === t.uuid);
            if (!outcome) return t;
            return {
              ...t,
              outcome: {
                saved: Boolean(outcome.saved ?? outcome.success),
                total: outcome.total ?? null,
                dc: outcome.dc ?? null
              }
            };
          })
        : next.targets;
      next = {
        ...next,
        phase: "awaiting-damage-or-save",
        rolls,
        targets
      };
      traceEntries.push({
        type: "roll",
        kind: "save",
        rule: "combat.save-activity",
        detail: event.summary ?? "Saving throws recorded"
      });
      break;
    }

    case "damageRolled": {
      const rolls = [...(next.rolls ?? []), ...(event.rolls ?? [])];
      next = { ...next, phase: "ready-to-apply", rolls };
      traceEntries.push({
        type: "roll",
        kind: "damage",
        rule: "combat.activity-use",
        detail: event.summary ?? "Damage roll recorded"
      });
      break;
    }

    case "recordChange": {
      next = {
        ...next,
        appliedChanges: [...(next.appliedChanges ?? []), ...(event.changes ?? [])]
      };
      traceEntries.push({
        type: "change",
        rule: event.rule ?? "combat.activity-use",
        detail: event.summary ?? "Change recorded"
      });
      break;
    }

    case "useCompleted": {
      next = {
        ...next,
        phase: "completed",
        rolls: Array.isArray(event.rolls) ? [...next.rolls, ...event.rolls] : next.rolls,
        appliedChanges: Array.isArray(event.appliedChanges)
          ? [...next.appliedChanges, ...event.appliedChanges]
          : next.appliedChanges,
        pendingDecision: null
      };
      traceEntries.push({
        type: "phase",
        phase: next.phase,
        rule: "combat.activity-use",
        detail: event.summary ?? "Activity use finished"
      });
      break;
    }

    case "cancel": {
      next = { ...next, phase: "cancelled", cancelReason: event.reason ?? null, pendingDecision: null };
      traceEntries.push({ type: "phase", phase: next.phase, reason: event.reason ?? null });
      break;
    }

    case "correct": {
      const undo = [...(next.appliedChanges ?? [])].reverse();
      next = {
        ...next,
        phase: "corrected",
        pendingDecision: null
      };
      commands.push({
        id: `correct:${next.id}:${Date.now()}`,
        type: "applyCorrection",
        payload: {
          correction: event.correction ?? {},
          undoPlan: undo
        }
      });
      traceEntries.push({
        type: "phase",
        phase: next.phase,
        rule: "combat.correction",
        detail: event.correction?.reason ?? "Correction requested"
      });
      break;
    }

    default: {
      traceEntries.push({ type: "ignored", reason: "unknown-event", eventType: type });
      break;
    }
  }

  if (!ACTION_PHASES.includes(next.phase)) {
    throw new Error(`Invalid action phase: ${next.phase}`);
  }

  for (const entry of traceEntries) next = appendTrace(next, entry);
  return { state: next, commands, traceEntries };
}
