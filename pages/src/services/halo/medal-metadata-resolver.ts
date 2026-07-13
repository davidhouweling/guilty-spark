import type { HaloInfiniteClient, MatchStats } from "halo-infinite-api";
import { getMedalMetadataFromMatches, type MedalMetadata } from "@guilty-spark/shared/halo/medals";

type MedalLookup = ReadonlyMap<number, { name: string; sortingWeight: number }>;

export class HaloMedalMetadataResolver {
  private medalLookupPromise: Promise<MedalLookup> | null = null;

  public constructor(
    private readonly haloClient: Pick<HaloInfiniteClient, "getMedalsMetadataFile">,
  ) {}

  public async getMedalMetadataForMatch(stats: MatchStats): Promise<MedalMetadata> {
    try {
      const medalLookup = await this.getMedalLookupAsync();
      return await getMedalMetadataFromMatches(
        { [stats.MatchId]: stats },
        async (medalId) => Promise.resolve(medalLookup.get(medalId)),
      );
    } catch {
      return {};
    }
  }

  private async getMedalLookupAsync(): Promise<MedalLookup> {
    this.medalLookupPromise ??= this.loadMedalLookupAsync();
    return this.medalLookupPromise;
  }

  private async loadMedalLookupAsync(): Promise<MedalLookup> {
    const metadataFile = await this.haloClient.getMedalsMetadataFile();
    const medalLookup = new Map<number, { name: string; sortingWeight: number }>();

    for (const medal of metadataFile.medals) {
      medalLookup.set(medal.nameId, {
        name: medal.name.value,
        sortingWeight: medal.sortingWeight,
      });
    }

    return medalLookup;
  }
}
