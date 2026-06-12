#!/usr/bin/env node
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authenticate } from "@xboxreplay/xboxlive-auth";
import type { MatchStats } from "halo-infinite-api";
import { aFakeEnvWith } from "../base/fakes/env.fake";
import { createFileBackedKVNamespace } from "../base/fakes/namespace-to-file";
import { CustomSpartanTokenProvider } from "../services/halo/custom-spartan-token-provider";
import { HaloFilmService } from "../services/halo/halo-film";
import { XboxService } from "../services/xbox/xbox";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ValidationOutput {
  matchId: string;
  timestamp: string;
  filmAnalytics: {
    entries: {
      killerXuid: string;
      victimXuid: string;
      count: number;
      headshotKills: number;
      perfects: number;
    }[];
    pairingQuality: {
      unpairedDeathCount: number;
      maxTimeDeltaMs: number;
    };
    perfectCounts: {
      total: number;
      byXuid: Record<string, number>;
    };
  };
  matchStatsContext: {
    gameVariantCategory: number;
    teamCount: number;
    playerCount: number;
  };
}

async function fetchJson<T>(url: string, spartanToken: string, clearanceToken?: string): Promise<T> {
  const acceptHeader = "application/json";
  const headers: HeadersInit = {
    Accept: acceptHeader,
    "Accept-Language": "en-US",
    "User-Agent": "SHIVA-2043073184/6.10021.18539.0 (release; PC)",
    "x-343-authorization-spartan": spartanToken,
    ...(clearanceToken == null ? {} : { "343-clearance": clearanceToken }),
  };

  const response = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status.toString()} for ${url}`);
  }

  return response.json<T>();
}

async function main(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const matchId = process.argv[2]!;
  if (!matchId) {
    console.error("Usage: npx tsx scripts/validate-film-analytics.ts <matchId>");
    console.error("Example: npx tsx scripts/validate-film-analytics.ts 1331740f-a0b7-49d9-bac9-8db7c4c0e9ce");
    process.exit(1);
  }

  console.log(`Validating film analytics for match ${matchId}...`);

  const xboxUsername = process.env.XBOX_USERNAME;

  const xboxPassword = process.env.XBOX_PASSWORD;

  if (!xboxUsername || !xboxPassword) {
    console.error("Error: XBOX_USERNAME and XBOX_PASSWORD environment variables are required");
    process.exit(1);
  }

  const kvNamespace = await createFileBackedKVNamespace(path.join(__dirname, "film-validation-cache.json"));
  const env = aFakeEnvWith({
    APP_DATA: kvNamespace,
    XBOX_USERNAME: xboxUsername,
    XBOX_PASSWORD: xboxPassword,
  });

  const xboxService = new XboxService({ env, authenticate });
  const customSpartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });

  const haloFilmService = new HaloFilmService({
    env,
    spartanTokenProvider: customSpartanTokenProvider,
  });

  try {
    console.log("Authenticating and fetching match stats...");
    const spartanToken = await customSpartanTokenProvider.getSpartanToken();

    const matchStats = await fetchJson<MatchStats>(
      `https://halostats.svc.halowaypoint.com:443/hi/matches/${matchId}/stats`,
      spartanToken,
    );

    console.log(
      `✓ Match found: variant ${String(matchStats.MatchInfo.GameVariantCategory)}, ${matchStats.Teams.length.toString()} teams, ${matchStats.Players.length.toString()} players`,
    );

    console.log("Fetching and parsing film analytics...");
    const analytics = await haloFilmService.buildKillMatrixAnalytics(matchStats);

    const output: ValidationOutput = {
      matchId,
      timestamp: new Date().toISOString(),
      filmAnalytics: {
        entries: analytics.entries.map((entry) => ({
          killerXuid: entry.killerXuid,
          victimXuid: entry.victimXuid,
          count: entry.count,
          headshotKills: entry.headshotKills,
          perfects: entry.perfects,
        })),
        pairingQuality: analytics.pairingQuality,
        perfectCounts: analytics.perfectCounts,
      },
      matchStatsContext: {
        gameVariantCategory: matchStats.MatchInfo.GameVariantCategory,
        teamCount: matchStats.Teams.length,
        playerCount: matchStats.Players.length,
      },
    };

    console.log("\n✓ Film analytics validation complete!");
    console.log(JSON.stringify(output, null, 2));
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("✗ Error during validation:", errorMessage);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error("✗ Fatal error:", errorMessage);
  process.exit(1);
});
