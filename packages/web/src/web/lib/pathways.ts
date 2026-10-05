/**
 * Public pathway copy shared by the landing page, FAQ, apply flow and /serve.
 * Zod-free so the landing bundle stays light. Entity names must match
 * api/crew/contract.ts (PAID_OPERATOR_ENTITY / NONPROFIT_ENTITY).
 */
export const PAID_ENTITY = "Sanctuary LV Group";
export const NONPROFIT_ENTITY = "Sanctuary LV nonprofit";

/** Proposed wording from the implementation brief (section 3). */
export const PATHWAY_NOTICE =
  "Paid Host and Promoter opportunities are operated by Sanctuary LV Group. Compensation, duties and engagement terms are provided for each approved opportunity. Applying does not guarantee selection or an event assignment. Unpaid Volunteer / Serve Team opportunities with Sanctuary LV nonprofit are available through a separate pathway.";

/** No compensation or shifts are approved yet, so paid roles are candidate interest only. */
export const OPPORTUNITY_STATUS = "Future opportunities / candidate interest";

export const EVENT_CONTENT =
  "Sanctuary nights include live music, a Christian message, worship and an optional time of prayer.";

export const REVIEW_BASIS = "Applications are reviewed on role-related capability, reliability and respectful conduct.";
