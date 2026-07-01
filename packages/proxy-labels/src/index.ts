/**
 * Pure translation of a session into the routing primitives of an ingress.
 *
 * Docker mode → Traefik container labels (picked up from the Docker event
 * stream with no reload). Kubernetes mode → Ingress annotations (Phase 4).
 * Keeping this a pure function lets the agent (Docker) and a future k8s driver
 * share one source of truth for how a session becomes reachable.
 */

export type RoutingMode = 'path' | 'subdomain';

export interface SessionRouteInput {
  /** Opaque per-session token used in the public URL. */
  kasmId: string;
  /** Port the stream server listens on inside the container (KasmVNC → 6901). */
  internalPort: number;
  /** Public base domain, e.g. `asha.local`. */
  domain: string;
  /** Docker network the session container and Traefik share. */
  network: string;
  mode?: RoutingMode;
  /** Name of a Traefik forward-auth middleware (file provider) to attach. */
  forwardAuthMiddleware?: string;
}

export function routerName(kasmId: string): string {
  return `sess-${kasmId}`;
}

export function sessionPath(kasmId: string): string {
  return `/session/${kasmId}`;
}

export function sessionHost(kasmId: string, domain: string): string {
  return `${kasmId}.sessions.${domain}`;
}

export function sessionTraefikLabels(input: SessionRouteInput): Record<string, string> {
  const mode = input.mode ?? 'path';
  const router = routerName(input.kasmId);
  const rule =
    mode === 'subdomain'
      ? `Host(\`${sessionHost(input.kasmId, input.domain)}\`)`
      : `PathPrefix(\`${sessionPath(input.kasmId)}\`)`;

  const labels: Record<string, string> = {
    'traefik.enable': 'true',
    'traefik.docker.network': input.network,
    [`traefik.http.routers.${router}.rule`]: rule,
    [`traefik.http.routers.${router}.entrypoints`]: 'websecure',
    [`traefik.http.routers.${router}.tls`]: 'true',
    [`traefik.http.services.${router}.loadbalancer.server.port`]: String(input.internalPort),
    // Explicit router→service link. REQUIRED once a container exposes more than
    // one Traefik service (e.g. the audio aux-route): with multiple services the
    // Docker provider refuses to auto-link and ALL routers on the container break
    // ("cannot be linked automatically with multiple Services").
    [`traefik.http.routers.${router}.service`]: router,
  };

  const middlewares: string[] = [];

  if (mode === 'path') {
    labels[`traefik.http.middlewares.${router}-strip.stripprefix.prefixes`] = sessionPath(input.kasmId);
    middlewares.push(`${router}-strip`);
  }
  if (input.forwardAuthMiddleware) {
    middlewares.push(input.forwardAuthMiddleware);
  }
  if (middlewares.length) {
    labels[`traefik.http.routers.${router}.middlewares`] = middlewares.join(',');
  }

  return labels;
}

/** Connection URL the manager hands to the browser once a session is RUNNING. */
export function sessionConnectionUrl(input: {
  kasmId: string;
  proxyBaseUrl: string;
  token: string;
  mode?: RoutingMode;
  domain?: string;
}): string {
  if ((input.mode ?? 'path') === 'subdomain' && input.domain) {
    return `https://${sessionHost(input.kasmId, input.domain)}/?token=${input.token}`;
  }
  // Path-mode: the KasmVNC/noVNC client builds its stream WebSocket from the
  // `path` query param (default "websockify"), which it resolves against the
  // ROOT host — so without this it opens `wss://<host>/websockify`, a path
  // Traefik can't map to any session (the session router is
  // `PathPrefix(/session/<kasmId>)`) → 502 and a frozen first frame. Scope the
  // WS path to the session so the upgrade routes through the (prefix-stripped)
  // session router to the container's KasmVNC.
  const base = input.proxyBaseUrl.replace(/\/$/, '');
  // KasmVNC client tuning (read from the noVNC query vars): `resize=remote` makes
  // the desktop track the viewer size — full-bleed at native resolution, with no
  // letterboxing or upscaling blur; `enable_webp` + a high `quality` keep the
  // stream sharp while staying bandwidth-efficient (so it also feels faster).
  const tuning = 'resize=remote&quality=8&enable_webp=true';
  return `${base}${sessionPath(input.kasmId)}/?path=session/${input.kasmId}/websockify&${tuning}&token=${input.token}`;
}
