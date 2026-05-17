import type {
  IndividualTrackerCreateProfileRequest,
  IndividualTrackerCreateProfileResponse,
  IndividualTrackerGamesResponse,
  IndividualTrackerMutateGamesRequest,
  IndividualTrackerProfile,
  IndividualTrackerProfileResponse,
  IndividualTrackerReorderGamesRequest,
  IndividualTrackerService,
  IndividualTrackerUpdateProfileRequest,
  IndividualTrackerUpdateProfileResponse,
} from "../types";

interface FakeIndividualTrackerServiceOptions {
  readonly profileResponse: IndividualTrackerProfileResponse;
}

export interface FakeIndividualTrackerServiceFactoryOpts {
  readonly profile?: IndividualTrackerProfile | null;
  readonly games?: IndividualTrackerGamesResponse["games"];
}

function buildDefaultProfileResponse(
  profile: IndividualTrackerProfile | null,
  games: IndividualTrackerGamesResponse["games"],
): IndividualTrackerProfileResponse {
  return {
    profile,
    games,
  };
}

export class FakeIndividualTrackerService implements IndividualTrackerService {
  private readonly options: FakeIndividualTrackerServiceOptions;

  public constructor(options?: Partial<FakeIndividualTrackerServiceOptions>) {
    this.options = {
      profileResponse: options?.profileResponse ?? {
        profile: null,
        games: [],
      },
    };
  }

  public async getProfile(): Promise<IndividualTrackerProfileResponse> {
    await Promise.resolve();
    return this.options.profileResponse;
  }

  public async createProfile(
    request: IndividualTrackerCreateProfileRequest,
  ): Promise<IndividualTrackerCreateProfileResponse> {
    void request;
    await Promise.resolve();

    if (this.options.profileResponse.profile === null) {
      throw new Error("No profile configured in fake service");
    }

    return { profile: this.options.profileResponse.profile };
  }

  public async updateProfile(
    request: IndividualTrackerUpdateProfileRequest,
  ): Promise<IndividualTrackerUpdateProfileResponse> {
    void request;
    await Promise.resolve();

    if (this.options.profileResponse.profile === null) {
      throw new Error("No profile configured in fake service");
    }

    return { profile: this.options.profileResponse.profile };
  }

  public async addGame(request: IndividualTrackerMutateGamesRequest): Promise<IndividualTrackerGamesResponse> {
    void request;
    await Promise.resolve();
    return { games: this.options.profileResponse.games };
  }

  public async removeGame(request: IndividualTrackerMutateGamesRequest): Promise<IndividualTrackerGamesResponse> {
    void request;
    await Promise.resolve();
    return { games: this.options.profileResponse.games };
  }

  public async reorderGames(request: IndividualTrackerReorderGamesRequest): Promise<IndividualTrackerGamesResponse> {
    void request;
    await Promise.resolve();
    return { games: this.options.profileResponse.games };
  }
}

export function aFakeIndividualTrackerServiceWith(
  opts: FakeIndividualTrackerServiceFactoryOpts = {},
): FakeIndividualTrackerService {
  return new FakeIndividualTrackerService({
    profileResponse: buildDefaultProfileResponse(opts.profile ?? null, opts.games ?? []),
  });
}
