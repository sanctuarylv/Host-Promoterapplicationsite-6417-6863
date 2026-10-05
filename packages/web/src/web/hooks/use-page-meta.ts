import { useEffect } from "react";

/** Per-route <title> and robots. Static OG/Twitter tags live in index.html. */
export function usePageMeta(title: string, opts: { noindex?: boolean } = {}) {
  useEffect(() => {
    document.title = title;
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (opts.noindex) {
      if (!robots) {
        robots = document.createElement("meta");
        robots.name = "robots";
        document.head.appendChild(robots);
      }
      robots.content = "noindex, nofollow";
    } else if (robots) {
      robots.content = "index, follow";
    }
  }, [title, opts.noindex]);
}
