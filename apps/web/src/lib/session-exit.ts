/**
 * What "End session" must actually do, as a decision separate from the two
 * viewers that make it.
 *
 * Ending a desktop has been quietly broken three times, and every time the same
 * way: the click ran, the DELETE did not, and the user was returned to the
 * workstation believing a session was gone while it kept running and kept
 * consuming their time budget. Each viewer guarded the call with its own inline
 * condition (`if (session)`, then `if (session?.id)`), so a missing id read as
 * "nothing to do" instead of "we cannot do this".
 *
 * There are exactly three outcomes, and "skip the call but leave anyway" is not
 * one of them.
 */
export type SessionExitPlan =
  /** Live backend and a known id — terminate server-side, then leave. */
  | { action: 'terminate'; sessionId: string }
  /** Mock backend — there is no server to call; leave and report success. */
  | { action: 'local-only' }
  /** Live backend, no id — we cannot end it, so say so and stay put. */
  | { action: 'unresolved' };

export function planSessionExit(input: { live: boolean; sessionId?: string | null }): SessionExitPlan {
  if (!input.live) return { action: 'local-only' };
  const sessionId = input.sessionId?.trim();
  if (!sessionId) return { action: 'unresolved' };
  return { action: 'terminate', sessionId };
}
