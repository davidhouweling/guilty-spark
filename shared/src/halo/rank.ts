export type RankTier = "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond" | "Onyx";

export interface RankTierResult {
  readonly rankTier: RankTier;
  readonly subTier: number;
}

interface RankThreshold {
  readonly minimumCsr: number;
  readonly rankTier: RankTier;
  readonly subTier: number;
}

const RANK_THRESHOLDS: readonly RankThreshold[] = [
  { minimumCsr: 1500, rankTier: "Onyx", subTier: 0 },
  { minimumCsr: 1450, rankTier: "Diamond", subTier: 5 },
  { minimumCsr: 1400, rankTier: "Diamond", subTier: 4 },
  { minimumCsr: 1350, rankTier: "Diamond", subTier: 3 },
  { minimumCsr: 1300, rankTier: "Diamond", subTier: 2 },
  { minimumCsr: 1250, rankTier: "Diamond", subTier: 1 },
  { minimumCsr: 1200, rankTier: "Diamond", subTier: 0 },
  { minimumCsr: 1150, rankTier: "Platinum", subTier: 5 },
  { minimumCsr: 1100, rankTier: "Platinum", subTier: 4 },
  { minimumCsr: 1050, rankTier: "Platinum", subTier: 3 },
  { minimumCsr: 1000, rankTier: "Platinum", subTier: 2 },
  { minimumCsr: 950, rankTier: "Platinum", subTier: 1 },
  { minimumCsr: 900, rankTier: "Platinum", subTier: 0 },
  { minimumCsr: 850, rankTier: "Gold", subTier: 5 },
  { minimumCsr: 800, rankTier: "Gold", subTier: 4 },
  { minimumCsr: 750, rankTier: "Gold", subTier: 3 },
  { minimumCsr: 700, rankTier: "Gold", subTier: 2 },
  { minimumCsr: 650, rankTier: "Gold", subTier: 1 },
  { minimumCsr: 600, rankTier: "Gold", subTier: 0 },
  { minimumCsr: 550, rankTier: "Silver", subTier: 5 },
  { minimumCsr: 500, rankTier: "Silver", subTier: 4 },
  { minimumCsr: 450, rankTier: "Silver", subTier: 3 },
  { minimumCsr: 400, rankTier: "Silver", subTier: 2 },
  { minimumCsr: 350, rankTier: "Silver", subTier: 1 },
  { minimumCsr: 300, rankTier: "Silver", subTier: 0 },
  { minimumCsr: 250, rankTier: "Bronze", subTier: 5 },
  { minimumCsr: 200, rankTier: "Bronze", subTier: 4 },
  { minimumCsr: 150, rankTier: "Bronze", subTier: 3 },
  { minimumCsr: 100, rankTier: "Bronze", subTier: 2 },
  { minimumCsr: 50, rankTier: "Bronze", subTier: 1 },
];

export function getRankTierFromCsr(csr: number): RankTierResult {
  for (const threshold of RANK_THRESHOLDS) {
    if (csr >= threshold.minimumCsr) {
      return {
        rankTier: threshold.rankTier,
        subTier: threshold.subTier,
      };
    }
  }

  return { rankTier: "Bronze", subTier: 0 };
}
