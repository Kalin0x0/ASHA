'use client';

/**
 * Drives the "Update now" flow on Developer → Updates through the same phases a
 * real self-hosted update performs: fetch the new release, build the images, run
 * database migrations and restart the services.
 *
 * On a self-hosted deployment the actual work is done by the platform updater on
 * the host — `scripts/install.sh update` (git pull → docker compose build →
 * prisma migrate → restart). This runner steps the UI through those phases and,
 * on completion, the page offers a reload so the freshly-built bundle is picked
 * up. Wiring it to a host-updater endpoint is deployment-specific; until then it
 * runs the staged flow locally (consistent with the app's mock-first data layer).
 */

export type UpdatePhase = 'check' | 'download' | 'apply' | 'restart' | 'done';

/** Ordered phases; `done` is terminal. */
export const UPDATE_PHASES: UpdatePhase[] = ['check', 'download', 'apply', 'restart', 'done'];

/** Phases that represent actual work (everything before the terminal `done`). */
export const UPDATE_WORK_PHASES: UpdatePhase[] = UPDATE_PHASES.filter((p) => p !== 'done');

export interface UpdateProgress {
  phase: UpdatePhase;
  /** 0-based index of the current phase within {@link UPDATE_PHASES}. */
  index: number;
  /** Completion ratio 0…1 (1 when `done`). */
  ratio: number;
}

const PHASE_MS: Record<UpdatePhase, number> = {
  check: 900,
  download: 1400,
  apply: 1600,
  restart: 1100,
  done: 0,
};

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run the staged update, reporting progress after each phase begins. Resolves
 * once the terminal `done` phase is reached. `signal` aborts between phases.
 */
export async function runUpdate(
  onProgress: (p: UpdateProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const total = UPDATE_PHASES.length - 1; // index of `done`
  for (let i = 0; i < UPDATE_PHASES.length; i += 1) {
    if (signal?.aborted) throw new DOMException('Update aborted', 'AbortError');
    const phase = UPDATE_PHASES[i]!;
    onProgress({ phase, index: i, ratio: i / total });
    if (phase === 'done') return;
    await delay(PHASE_MS[phase]);
  }
}
