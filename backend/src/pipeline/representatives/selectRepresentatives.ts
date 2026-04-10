import type { ExperienceUnit } from '../../types/internal.js';
import type { RepresentativePost } from '../../types/topicBundle.js';
import { THRESHOLDS } from '../../config/thresholds.js';
import { buildRepresentativeExcerpt, toRedditUrl } from '../units/buildExperienceUnits.js';
import { normalizeDisplayText } from '../text/displayText.js';

function repQualityForPositive(u: ExperienceUnit): number {
  const len = u.raw.body.length + (u.raw.title?.length ?? 0);
  const votes = u.reddit_score ?? 0;
  return u.experienceScore * 4 + Math.log(len + 1) * 2 + Math.log(Math.max(1, votes + 1)) * 1.2;
}

function repQualityForNegative(u: ExperienceUnit): number {
  const len = u.raw.body.length + (u.raw.title?.length ?? 0);
  const votes = u.reddit_score ?? 0;
  /** Prefer clearly low scores + substantive text + some community engagement */
  return (10 - u.experienceScore) * 3 + Math.log(len + 1) * 2 + Math.log(Math.max(1, votes + 1));
}

function toRep(u: ExperienceUnit): RepresentativePost {
  return {
    id: u.id,
    username: u.username,
    excerpt: normalizeDisplayText(buildRepresentativeExcerpt(u.raw, 400)),
    url: toRedditUrl(u.raw.permalink),
    timestamp_utc: u.timestamp_utc,
    score: u.experienceScore,
    reddit_score: u.reddit_score,
    subreddit: u.subreddit,
  };
}

function passesBodyQuality(u: ExperienceUnit): boolean {
  const len = u.raw.body.length + (u.raw.title?.length ?? 0);
  if (len < THRESHOLDS.representativeMinBody) return false;
  if (/^(lol|lmao|same|this|\+1)$/i.test(u.raw.body.trim())) return false;
  return true;
}

/**
 * Select illustrative posts with **strong stance separation**:
 * - Positive slot: only clearly positive stance + score floor (no mixed/unclear).
 * - Negative slot: only clearly negative stance + score ceiling (no mixed/unclear).
 */
export function selectRepresentatives(units: ExperienceUnit[]): {
  positive: RepresentativePost | null;
  negative: RepresentativePost | null;
} {
  const posPool = units.filter(
    (u) =>
      passesBodyQuality(u) &&
      u.extraction.firstHand &&
      !u.extraction.hearsay &&
      u.extraction.stance === 'positive' &&
      u.category === 'positive' &&
      u.experienceScore >= THRESHOLDS.repPositiveMinScore
  );

  const negPool = units.filter(
    (u) =>
      passesBodyQuality(u) &&
      u.extraction.firstHand &&
      !u.extraction.hearsay &&
      u.extraction.stance === 'negative' &&
      u.category === 'negative' &&
      u.experienceScore <= THRESHOLDS.repNegativeMaxScore
  );

  posPool.sort((a, b) => repQualityForPositive(b) - repQualityForPositive(a));
  /** Prefer the clearest negative experience (lowest score), then substantiveness */
  negPool.sort((a, b) => {
    const byScore = a.experienceScore - b.experienceScore;
    if (Math.abs(byScore) > 0.05) return byScore;
    return repQualityForNegative(b) - repQualityForNegative(a);
  });

  return {
    positive: posPool[0] ? toRep(posPool[0]!) : null,
    negative: negPool[0] ? toRep(negPool[0]!) : null,
  };
}
