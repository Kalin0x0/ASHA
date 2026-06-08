/**
 * The signed-in end-user for the portal. In mock mode this is a fixed identity
 * (matching the seed data and `store.launchSession`); in live mode the portal
 * will hydrate this from the authenticated session. Centralised here so the
 * header avatar and "My Sessions" strip agree on who "me" is.
 */
export const CURRENT_USER = {
  id: 'user-1',
  name: 'Shahin Naiemi',
  email: 'shahin.naiemi@chista.local',
  initials: 'SN',
} as const;
