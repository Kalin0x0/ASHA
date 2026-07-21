'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useLaunchableWorkspaces, useLaunchSession } from '@/lib/hooks';
import { launchTransition } from '@/lib/launch-overlay-store';
import type { Workspace } from '@/lib/types';

/**
 * Shared workspace-launch flow for the OS desktop (dock + Launchpad + windows).
 * Mirrors the classic launcher's semantics exactly:
 *  - containers → streaming viewer (/session/:id)
 *  - server-backed RDP → the "Web Native vs RDP Client" chooser first
 *  - other server protocols (VNC/SSH) → the remote-desktop viewer (/connect/:kasmId)
 */
export function useWorkspaceLaunch() {
  const t = useTranslations('portal');
  const router = useRouter();
  const workspaces = useLaunchableWorkspaces();
  const launch = useLaunchSession();
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  // RDP-capable desktops open a chooser ("Web Native" vs "RDP Client") first.
  const [launchTarget, setLaunchTarget] = useState<Workspace | null>(null);

  const launchWebNative = async (id: string) => {
    setLaunchingId(id);
    const ws = workspaces.find((w) => w.id === id);
    const session = await launch(id);
    if (!session) {
      toast.error(t('launcher.launchError'));
      setLaunchingId(null);
      return;
    }
    setLaunchTarget(null);
    const path = ws && ws.type !== 'CONTAINER' ? `/connect/${session.kasmId}` : `/session/${session.id}`;
    launchTransition(
      {
        name: ws?.friendlyName ?? session.workspaceName,
        iconUrl: ws?.iconUrl,
        dockerImage: ws?.dockerImage,
        category: ws?.category,
      },
      () => router.push(path),
    );
  };

  // Same as launchWebNative, but delivers the viewer into a pre-opened browser
  // tab (`win`) instead of navigating the current one — the desktop stays put.
  // `win` is opened synchronously on click to dodge the pop-up blocker; we point
  // it at the session URL once the launch resolves.
  const launchWebNativeInTab = async (id: string, win: Window | null) => {
    setLaunchingId(id);
    const ws = workspaces.find((w) => w.id === id);
    const session = await launch(id);
    setLaunchingId(null);
    if (!session) {
      win?.close();
      toast.error(t('launcher.launchError'));
      return;
    }
    setLaunchTarget(null);
    const path = ws && ws.type !== 'CONTAINER' ? `/connect/${session.kasmId}` : `/session/${session.id}`;
    const url = `${window.location.origin}${path}`;
    if (win) win.location.href = url;
    else window.open(url, '_blank', 'noopener'); // fallback if the tab was blocked
  };

  const onLaunch = (id: string) => {
    const ws = workspaces.find((w) => w.id === id);
    if (ws && ws.type === 'SERVER' && ws.protocol === 'RDP') {
      setLaunchTarget(ws);
      return;
    }
    void launchWebNative(id);
  };

  return {
    workspaces,
    launchingId,
    launchTarget,
    setLaunchTarget,
    onLaunch,
    launchWebNative,
    launchWebNativeInTab,
  };
}
