import { Injectable } from '@nestjs/common';
import { RedisService } from '../../common/redis.service';
import { liveHolds, watchKey, type WatchHold, type WatchRecord } from '../observation/observation.service';

/**
 * Whether an administrator's observation of one session is still open — asked by
 * the forward-auth gate, once per request that reaches a container's `/observe`
 * route.
 *
 * The record is ObservationService's; this only reads it. Keeping the shape in
 * one place matters more here than the import it costs: a second idea of what
 * "someone is watching" means would drift from the one that puts the notice on
 * the watched person's screen, and the whole point is that the credential and
 * the notice end together.
 */

// The gate runs on every request the observe router carries — the stream
// upgrade, but also each asset the KasmVNC client pulls — so the read has to be
// cheap. Only an OPEN window is cached: a denial always re-reads, so pressing
// stop takes effect within this window rather than after it, and a replayed
// cookie never gets a free pass out of a cache it filled itself.
const RECORD_CACHE_MS = 2_000;
// The cache holds one entry per session actively being watched. Sweeping only
// past this many keeps the common case allocation-free.
const CACHE_SWEEP_AT = 32;

@Injectable()
export class ObserveGrantService {
  private readonly cache = new Map<string, { holds: WatchHold[]; readAt: number }>();

  constructor(private readonly redis: RedisService) {}

  /**
   * Epoch ms the named observer's grant on this session lapses at, or 0 when
   * they hold nothing.
   *
   * Per observer, not per session: two administrators may watch the same
   * desktop, and one of them pressing stop has to end THEIR access even though
   * the record — and the notice — stays up for the other.
   *
   * An unreadable Redis reads as "holds nothing", which refuses. That direction
   * is deliberate. The record is written through the same client the gate reads
   * it with, so without Redis no hold can be opened either: allowing here would
   * grant a window that could not have been asked for. The cost of the refusal
   * is bounded and only ever falls on an observer — nothing on the route that
   * serves a user their own desktop consults this, so a Redis outage can never
   * lock anyone out of their own session; it only stops watching, which needs
   * Redis for the samples and the notice anyway.
   */
  async holdExpiry(kasmId: string, observerUserId: string | undefined): Promise<number> {
    // A proof that names no observer cannot be matched against a hold, and a
    // hold is what the observe route is authorized by.
    if (!observerUserId) return 0;
    const now = Date.now();
    let latest = 0;
    for (const hold of await this.holds(kasmId, now)) {
      if (hold.observerUserId === observerUserId && hold.expiresAt > latest) latest = hold.expiresAt;
    }
    return latest;
  }

  /** The holds still standing on one session, from Redis or the short cache. */
  private async holds(kasmId: string, now: number): Promise<WatchHold[]> {
    const cached = this.cache.get(kasmId);
    // Re-filtered rather than returned as read: a hold inside the cache window
    // can still lapse, and the record outlives its shortest hold by design.
    if (cached && cached.readAt + RECORD_CACHE_MS > now) return liveHolds({ holds: cached.holds }, now);

    const holds = liveHolds(await this.redis.get<WatchRecord>(watchKey(kasmId)), now);
    if (holds.length === 0) this.cache.delete(kasmId);
    else this.cache.set(kasmId, { holds, readAt: now });
    this.sweep(now);
    return holds;
  }

  /** Sessions come and go; without this the map keeps a key per kasmId ever watched. */
  private sweep(now: number): void {
    if (this.cache.size <= CACHE_SWEEP_AT) return;
    for (const [kasmId, entry] of this.cache) {
      if (entry.readAt + RECORD_CACHE_MS <= now) this.cache.delete(kasmId);
    }
  }
}
