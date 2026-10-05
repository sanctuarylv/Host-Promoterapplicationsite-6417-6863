import { Cta, Wordmark } from "../components/crew/chrome";
import { usePageMeta } from "../hooks/use-page-meta";

export default function NotFound() {
  usePageMeta("Not found — Sanctuary LV", { noindex: true });
  return (
    <main id="main" className="flex min-h-[100svh] flex-col justify-between bg-sx-black px-5 py-6 sm:px-8 lg:px-12">
      <Wordmark />
      <div>
        <p className="eyebrow text-white/60">404</p>
        <h1 className="display mt-6 text-[clamp(3rem,12vw,9rem)]">Wrong door.</h1>
        <Cta href="/crew" entry="404" className="mt-10 w-full sm:w-auto sm:min-w-72">
          Back to the team page
        </Cta>
      </div>
      <span />
    </main>
  );
}
