import { useEffect } from "react";
import { SITE_URL } from "../lib/site-config";

function upsert<T extends HTMLElement>(selector: string, create: () => T): T {
  let el = document.head.querySelector<T>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  return el;
}

/**
 * Per-route <title>, robots and canonical URL. Static OG/Twitter tags live in
 * index.html. Canonical URLs use the production origin (VITE_SITE_URL, which
 * vite.config.ts defaults to https://crew.sanctuarylv.org) — never the
 * preview host. `/` is canonicalised to `/crew` (same landing page).
 */
export function usePageMeta(title: string, opts: { noindex?: boolean } = {}) {
  useEffect(() => {
    document.title = title;
    const robots = upsert<HTMLMetaElement>('meta[name="robots"]', () => Object.assign(document.createElement("meta"), { name: "robots" }));
    robots.content = opts.noindex ? "noindex, nofollow" : "index, follow";

    const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (opts.noindex || !SITE_URL) {
      existing?.remove();
      return;
    }
    const path = window.location.pathname === "/" ? "/crew" : window.location.pathname.replace(/\/+$/, "") || "/crew";
    const link = existing ?? upsert<HTMLLinkElement>('link[rel="canonical"]', () => Object.assign(document.createElement("link"), { rel: "canonical" }));
    link.href = `${SITE_URL}${path}`;
  }, [title, opts.noindex]);
}
