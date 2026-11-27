import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/**
 * False while the server renders and while React hydrates that HTML, true from
 * the first client render after it.
 *
 * Anything that reads the browser — its time zone, its clock, its origin — must
 * wait for this. The server renders in the container's UTC with its own clock and
 * no `window`; if the browser's first render prints something else, React throws
 * away the server HTML for that subtree (minified error #418) and repaints it.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
