import { describe, it, expect } from "vitest";
import { getRankTierFromCsr } from "../rank";

describe("getRankTierFromCsr", () => {
  it("returns Onyx for CSR >= 1500", () => {
    expect(getRankTierFromCsr(1500)).toEqual({ rankTier: "Onyx", subTier: 0 });
    expect(getRankTierFromCsr(2000)).toEqual({ rankTier: "Onyx", subTier: 0 });
  });

  it("returns Diamond tiers for CSR 1200-1499", () => {
    expect(getRankTierFromCsr(1450)).toEqual({ rankTier: "Diamond", subTier: 5 });
    expect(getRankTierFromCsr(1400)).toEqual({ rankTier: "Diamond", subTier: 4 });
    expect(getRankTierFromCsr(1350)).toEqual({ rankTier: "Diamond", subTier: 3 });
    expect(getRankTierFromCsr(1300)).toEqual({ rankTier: "Diamond", subTier: 2 });
    expect(getRankTierFromCsr(1250)).toEqual({ rankTier: "Diamond", subTier: 1 });
    expect(getRankTierFromCsr(1200)).toEqual({ rankTier: "Diamond", subTier: 0 });
  });

  it("returns Platinum tiers for CSR 900-1199", () => {
    expect(getRankTierFromCsr(1150)).toEqual({ rankTier: "Platinum", subTier: 5 });
    expect(getRankTierFromCsr(1100)).toEqual({ rankTier: "Platinum", subTier: 4 });
    expect(getRankTierFromCsr(1050)).toEqual({ rankTier: "Platinum", subTier: 3 });
    expect(getRankTierFromCsr(1000)).toEqual({ rankTier: "Platinum", subTier: 2 });
    expect(getRankTierFromCsr(950)).toEqual({ rankTier: "Platinum", subTier: 1 });
    expect(getRankTierFromCsr(900)).toEqual({ rankTier: "Platinum", subTier: 0 });
  });

  it("returns Gold tiers for CSR 600-899", () => {
    expect(getRankTierFromCsr(850)).toEqual({ rankTier: "Gold", subTier: 5 });
    expect(getRankTierFromCsr(800)).toEqual({ rankTier: "Gold", subTier: 4 });
    expect(getRankTierFromCsr(750)).toEqual({ rankTier: "Gold", subTier: 3 });
    expect(getRankTierFromCsr(700)).toEqual({ rankTier: "Gold", subTier: 2 });
    expect(getRankTierFromCsr(650)).toEqual({ rankTier: "Gold", subTier: 1 });
    expect(getRankTierFromCsr(600)).toEqual({ rankTier: "Gold", subTier: 0 });
  });

  it("returns Silver tiers for CSR 300-599", () => {
    expect(getRankTierFromCsr(550)).toEqual({ rankTier: "Silver", subTier: 5 });
    expect(getRankTierFromCsr(500)).toEqual({ rankTier: "Silver", subTier: 4 });
    expect(getRankTierFromCsr(450)).toEqual({ rankTier: "Silver", subTier: 3 });
    expect(getRankTierFromCsr(400)).toEqual({ rankTier: "Silver", subTier: 2 });
    expect(getRankTierFromCsr(350)).toEqual({ rankTier: "Silver", subTier: 1 });
    expect(getRankTierFromCsr(300)).toEqual({ rankTier: "Silver", subTier: 0 });
  });

  it("returns Bronze tiers for CSR 0-299", () => {
    expect(getRankTierFromCsr(250)).toEqual({ rankTier: "Bronze", subTier: 5 });
    expect(getRankTierFromCsr(200)).toEqual({ rankTier: "Bronze", subTier: 4 });
    expect(getRankTierFromCsr(150)).toEqual({ rankTier: "Bronze", subTier: 3 });
    expect(getRankTierFromCsr(100)).toEqual({ rankTier: "Bronze", subTier: 2 });
    expect(getRankTierFromCsr(50)).toEqual({ rankTier: "Bronze", subTier: 1 });
    expect(getRankTierFromCsr(0)).toEqual({ rankTier: "Bronze", subTier: 0 });
  });
});
