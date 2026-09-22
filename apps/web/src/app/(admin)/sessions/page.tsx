import { redirect } from 'next/navigation';

/**
 * "Live Sessions" was a duplicate of Live Monitor and has been retired. Anyone
 * who still lands on /sessions — a bookmark, the command palette, a session's
 * "back to sessions" — is sent straight to the live monitor wall.
 */
export default function SessionsPage() {
  redirect('/sessions/monitor');
}
