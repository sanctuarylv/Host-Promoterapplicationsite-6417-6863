import { useEffect } from "react";
import { Grain, SiteFooter, SiteHeader } from "../components/crew/chrome";
import { ChooseRole, FinalCta, GoodToKnow, Hero, Marquee, Pathways, Progression, PromoterChallenge, WhyJoin } from "../components/crew/sections";
import { useReveal } from "../hooks/use-reveal";
import { usePageMeta } from "../hooks/use-page-meta";
import { track } from "../lib/analytics";
import { captureAttribution } from "../lib/attribution";

export default function CrewLanding() {
  usePageMeta("Join the Sanctuary LV Host + Promoter Team");
  useReveal();

  useEffect(() => {
    const { attribution: a } = captureAttribution();
    track(
      "crew_page_view",
      {
        has_ref: Boolean(a.referralCode),
        has_event: Boolean(a.eventId),
        utm_source: a.utmSource ?? "none",
        utm_medium: a.utmMedium ?? "none",
      },
      { once: window.location.pathname + window.location.search },
    );
  }, []);

  return (
    <>
      <Grain />
      <SiteHeader />
      <main id="main">
        <Hero />
        <Marquee />
        <ChooseRole />
        <Pathways />
        <PromoterChallenge />
        <WhyJoin />
        <Progression />
        <GoodToKnow />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
