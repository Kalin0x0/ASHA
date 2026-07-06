'use client';

import { create } from 'zustand';

interface ProfileState {
  open: boolean;
  openProfile: () => void;
  closeProfile: () => void;
}

/**
 * Ephemeral open/close state for the self-service profile dialog. The dialog is
 * mounted once in the desktop shell; every top-bar entry point (menu bar avatar,
 * Windows Start menu) just calls `openProfile()`.
 */
export const useProfileDialog = create<ProfileState>((set) => ({
  open: false,
  openProfile: () => set({ open: true }),
  closeProfile: () => set({ open: false }),
}));
