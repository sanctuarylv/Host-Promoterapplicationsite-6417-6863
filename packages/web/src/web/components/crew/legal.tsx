import { LEGAL, type LegalKey } from "../../lib/site-config";
import { cn } from "../../lib/utils";

/**
 * Links to official legal/consent documents. When a URL is not configured the
 * entry is a clearly labelled placeholder — no legal text is invented here.
 */
export function LegalLinks({ keys, className, tone = "dark" }: { keys: LegalKey[]; className?: string; tone?: "dark" | "light" }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs", tone === "dark" ? "text-white/60" : "text-sx-black/65", className)} aria-label="Legal documents">
      {keys.map((k) => {
        const d = LEGAL[k];
        return (
          <li key={k}>
            {d.url ? (
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
                {d.label}
              </a>
            ) : (
              <span data-legal-placeholder={d.envKey}>{d.label} — pending approval</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
