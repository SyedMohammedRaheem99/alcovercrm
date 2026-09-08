import type { Priority } from '@/lib/constants/enums';

/**
 * Transparent, rule-based lead scoring (0-100). No ML, no black box — the
 * salesperson can see exactly why a lead is HOT, which is what makes them
 * trust and act on it.
 *
 * Weights come from how this industry actually converts: construction stage and
 * timeline predict readiness to buy far better than budget talk, and a
 * completed site visit is the single strongest signal short of a quotation.
 */

export interface ScoreableLead {
  timeline?: string;
  constructionStage?: string;
  budgetMin?: number;
  budgetMax?: number;
  approxAreaSqft?: number;
  unitCount?: number;
  decisionMaker?: string;
  source?: string;
  stage?: string;
  firstContactedAt?: Date | null;
  contactAttempts?: number;
  hasCompetitorQuote?: boolean;
}

export interface ScoreFactor {
  label: string;
  points: number;
}

export interface ScoreResult {
  score: number;
  priority: Priority;
  factors: ScoreFactor[];
}

const HOT_THRESHOLD = 65;
const WARM_THRESHOLD = 35;

export function computeLeadScore(lead: ScoreableLead): ScoreResult {
  const factors: ScoreFactor[] = [];
  const add = (label: string, points: number) => {
    if (points !== 0) factors.push({ label, points });
  };

  /* ---- Timeline: the strongest single predictor of near-term revenue ---- */
  switch (lead.timeline) {
    case 'IMMEDIATE':
      add('Needs it immediately', 25);
      break;
    case 'WITHIN_1_MONTH':
      add('Buying within a month', 18);
      break;
    case 'ONE_TO_THREE_MONTHS':
      add('Buying in 1-3 months', 8);
      break;
    case 'SIX_PLUS_MONTHS':
      add('6+ months away', -10);
      break;
  }

  /* ---- Construction stage: windows go in near the end of a build ---- */
  switch (lead.constructionStage) {
    case 'FINISHING':
      add('At finishing stage', 20);
      break;
    case 'PLASTERING':
      add('At plastering stage', 15);
      break;
    case 'READY':
      add('Property ready', 12);
      break;
    case 'BRICKWORK':
      add('At brickwork stage', 6);
      break;
    case 'PLANNING':
    case 'FOUNDATION':
      add('Early construction stage', -5);
      break;
  }

  /* ---- Ticket size proxies ---- */
  const budget = lead.budgetMax ?? lead.budgetMin ?? 0;
  if (budget >= 150000) add('Budget above 1.5L', 12);
  else if (budget > 0 && budget < 50000) add('Small budget', -5);

  if ((lead.approxAreaSqft ?? 0) >= 500 || (lead.unitCount ?? 0) >= 10) {
    add('Large requirement', 12);
  }

  /* ---- Authority ---- */
  if (lead.decisionMaker === 'SELF') add('Speaking to the decision maker', 8);

  /* ---- Source quality: referrals and trade channels convert best ---- */
  switch (lead.source) {
    case 'REFERRAL':
    case 'REPEAT':
      add('Referral / repeat customer', 15);
      break;
    case 'ARCHITECT':
    case 'BUILDER':
      add('Trade channel lead', 15);
      break;
    case 'WALK_IN':
      add('Walked into the showroom', 15);
      break;
    case 'GMB':
      add('Found us on Google Business', 5);
      break;
  }

  /* ---- Engagement: what has actually happened so far ---- */
  const stage = lead.stage;
  if (stage === 'SITE_VISIT_DONE' || stage === 'QUOTED' || stage === 'NEGOTIATION') {
    add('Site visit completed', 20);
  }
  if (stage === 'QUOTED' || stage === 'NEGOTIATION') {
    add('Quotation sent', 15);
  }
  if (lead.firstContactedAt) {
    add('Successfully contacted', 10);
  }

  /* ---- Negative signals ---- */
  if (!lead.firstContactedAt && (lead.contactAttempts ?? 0) >= 3) {
    add('Unreachable after 3 attempts', -15);
  }
  if (lead.hasCompetitorQuote) {
    add('Has a competitor quote', -5);
  }

  const raw = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.max(0, Math.min(100, raw));

  const priority: Priority = score >= HOT_THRESHOLD ? 'HOT' : score >= WARM_THRESHOLD ? 'WARM' : 'COLD';

  return { score, priority, factors };
}
