/**
 * Conversion analytics. One call fans out to:
 *   1. Runable Analytics (window.stonks — injected by the template plugin)
 *   2. First-party mirror (crew.track → crew_events table) for the admin funnel
 *   3. window.dataLayer, if a tag manager is ever added (no-op otherwise)
 *
 * Props must never include PII (names, emails, phones, free text).
 */
import type { AnalyticsEventName } from "../../api/crew/contract";
import { client } from "./api";
import { getSessionId } from "./attribution";

type Props = Record<string, string | number | boolean>;

const onceKeys = new Set<string>();

export function track(name: AnalyticsEventName, props: Props = {}, opts: { once?: string } = {}) {
  if (opts.once) {
    const k = `${name}:${opts.once}`;
    if (onceKeys.has(k)) return;
    try {
      if (sessionStorage.getItem(`sx_once_${k}`)) return;
      sessionStorage.setItem(`sx_once_${k}`, "1");
    } catch {
      /* storage unavailable */
    }
    onceKeys.add(k);
  }
  try {
    window.stonks?.event(name, props);
  } catch {
    /* analytics must never break UX */
  }
  try {
    const w = window as unknown as { dataLayer?: unknown[] };
    w.dataLayer?.push({ event: name, ...props });
  } catch {
    /* ignore */
  }
  client.crew.track({ name, sessionId: getSessionId(), props }).catch(() => {});
}

/** Fire-and-forget beacon variant for page unload (abandonment). */
export function trackBeacon(name: AnalyticsEventName, props: Props = {}) {
  try {
    window.stonks?.event(name, props);
  } catch {
    /* ignore */
  }
  try {
    // oRPC RPC protocol: POST /api/rpc/<path> with body {"json": input}
    const body = JSON.stringify({ json: { name, sessionId: getSessionId(), props } });
    navigator.sendBeacon?.("/api/rpc/crew/track", new Blob([body], { type: "application/json" }));
  } catch {
    /* ignore */
  }
}
