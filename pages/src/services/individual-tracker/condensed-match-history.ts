import { condensedMatchHistoryPageContract } from "@guilty-spark/shared/contracts/individual-tracker/match-history";
import { prepareCondensedMatchHistory } from "./prepare-condensed-match-history";
import type {
  CondensedMatchHistoryRequest,
  CondensedMatchHistoryService,
  PreparedMatchHistoryPage,
} from "./condensed-match-history-types";

interface RealCondensedMatchHistoryServiceOptions {
  readonly apiHost: string;
}

export class RealCondensedMatchHistoryService implements CondensedMatchHistoryService {
  constructor(private readonly options: RealCondensedMatchHistoryServiceOptions) {}

  async getMatchHistory(request: CondensedMatchHistoryRequest): Promise<PreparedMatchHistoryPage> {
    const query = new URLSearchParams({
      start: request.start.toString(),
      count: request.count.toString(),
      category: request.category ?? "all",
    });
    if (request.gamertag != null) {
      query.set("gamertag", request.gamertag);
    }

    const response = await fetch(
      `${this.options.apiHost}/api/individual-tracker/search/${encodeURIComponent(request.xuid)}/matches?${query.toString()}`,
      { credentials: "include" },
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch match history (${response.status.toString()})`);
    }
    return prepareCondensedMatchHistory(await condensedMatchHistoryPageContract.fromResponse(response));
  }
}
