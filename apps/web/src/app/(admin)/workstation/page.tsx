import { WorkstationLauncher } from '@/components/composite/workstation-launcher';

/**
 * Admin "Workstation" view — the same end-user launcher, but rendered inside the
 * app shell (left nav sidebar + topbar). This is the ASHA Workstation design's
 * launcher-in-shell; the standalone end-user portal (`/`) stays chrome-free.
 */
export default function WorkstationPage() {
  return <WorkstationLauncher />;
}
