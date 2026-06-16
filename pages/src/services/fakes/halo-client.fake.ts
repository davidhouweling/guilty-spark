import type { HaloInfiniteClient, UserInfo } from "halo-infinite-api";
import { aFakeMatchStatsWith } from "../../controllers/stats/fakes/data";

type FakeHaloClientMethods = Pick<HaloInfiniteClient, "getMatchStats" | "getUsers" | "getMedalsMetadataFile">;

class FakeHaloClient implements FakeHaloClientMethods {
  public async getMatchStats(matchId: string): ReturnType<HaloInfiniteClient["getMatchStats"]> {
    await Promise.resolve();
    return aFakeMatchStatsWith({ MatchId: matchId });
  }

  public async getUsers(xuids: string[]): ReturnType<HaloInfiniteClient["getUsers"]> {
    await Promise.resolve();
    return xuids.map<UserInfo>((xuid) => ({
      xuid,
      gamertag: `Spartan ${xuid}`,
      gamerpic: { small: "", medium: "", large: "", xlarge: "" },
    }));
  }

  public async getMedalsMetadataFile(): ReturnType<HaloInfiniteClient["getMedalsMetadataFile"]> {
    await Promise.resolve();
    return { difficulties: [], types: [], sprites: {}, medals: [] };
  }
}

export function aFakeHaloClientWith(overrides?: Partial<FakeHaloClientMethods>): HaloInfiniteClient {
  const base = new FakeHaloClient();
  return Object.assign(base, overrides) as unknown as HaloInfiniteClient;
}
