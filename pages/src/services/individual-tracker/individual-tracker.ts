import { isRecord, isString, isNumber } from "@guilty-spark/shared/base/json-readers";
import type {
  IndividualTrackerCreateProfileRequest,
  IndividualTrackerCreateProfileResponse,
  IndividualTrackerGame,
  IndividualTrackerGamesResponse,
  IndividualTrackerMutateGamesRequest,
  IndividualTrackerService,
  IndividualTrackerProfile,
  IndividualTrackerProfileResponse,
  IndividualTrackerReorderGamesRequest,
  IndividualTrackerUpdateProfileRequest,
  IndividualTrackerUpdateProfileResponse,
} from "./types";

interface IndividualTrackerServiceOpts {
  apiHost: string;
}

function parseProfile(value: unknown): IndividualTrackerProfile | null {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new Error("Invalid profile payload");
  }

  const profileId = value.ProfileId;
  const userId = value.UserId;
  const activeIdentityId = value.ActiveIdentityId;
  const name = value.Name;
  const createdAt = value.CreatedAt;
  const updatedAt = value.UpdatedAt;

  if (!isString(profileId) || !isString(userId) || !isString(name) || !isNumber(createdAt) || !isNumber(updatedAt)) {
    throw new Error("Invalid profile payload");
  }

  if (activeIdentityId !== null && !isString(activeIdentityId)) {
    throw new Error("Invalid profile payload");
  }

  return {
    ProfileId: profileId,
    UserId: userId,
    ActiveIdentityId: activeIdentityId,
    Name: name,
    CreatedAt: createdAt,
    UpdatedAt: updatedAt,
  };
}

function parseGame(value: unknown): IndividualTrackerGame {
  if (!isRecord(value)) {
    throw new Error("Invalid game payload");
  }

  const profileId = value.ProfileId;
  const matchId = value.MatchId;
  const position = value.Position;
  const included = value.Included;
  const annotationsJson = value.AnnotationsJson;
  const createdAt = value.CreatedAt;
  const updatedAt = value.UpdatedAt;

  if (!isString(profileId) || !isString(matchId) || !isNumber(position) || !isString(annotationsJson)) {
    throw new Error("Invalid game payload");
  }

  if (included !== 0 && included !== 1) {
    throw new Error("Invalid game payload");
  }

  if (!isNumber(createdAt) || !isNumber(updatedAt)) {
    throw new Error("Invalid game payload");
  }

  return {
    ProfileId: profileId,
    MatchId: matchId,
    Position: position,
    Included: included,
    AnnotationsJson: annotationsJson,
    CreatedAt: createdAt,
    UpdatedAt: updatedAt,
  };
}

function parseGames(value: unknown): IndividualTrackerGame[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid games payload");
  }

  return value.map((game) => parseGame(game));
}

function parseProfileResponse(value: unknown): IndividualTrackerProfileResponse {
  if (!isRecord(value)) {
    throw new Error("Invalid profile response");
  }

  return {
    profile: parseProfile(value.profile),
    games: parseGames(value.games),
  };
}

function parseCreateProfileResponse(value: unknown): IndividualTrackerCreateProfileResponse {
  if (!isRecord(value)) {
    throw new Error("Invalid create profile response");
  }

  const profile = parseProfile(value.profile);
  if (profile === null) {
    throw new Error("Invalid create profile response");
  }

  return { profile };
}

function parseUpdateProfileResponse(value: unknown): IndividualTrackerUpdateProfileResponse {
  if (!isRecord(value)) {
    throw new Error("Invalid update profile response");
  }

  const profile = parseProfile(value.profile);
  if (profile === null) {
    throw new Error("Invalid update profile response");
  }

  return { profile };
}

function parseGamesResponse(value: unknown): IndividualTrackerGamesResponse {
  if (!isRecord(value)) {
    throw new Error("Invalid games response");
  }

  return {
    games: parseGames(value.games),
  };
}

export class RealIndividualTrackerService implements IndividualTrackerService {
  private readonly apiHost: string;

  constructor({ apiHost }: IndividualTrackerServiceOpts) {
    this.apiHost = apiHost;
  }

  private buildUrl(path: string): string {
    const baseUrl = this.apiHost.endsWith("/") ? this.apiHost.slice(0, -1) : this.apiHost;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
  }

  private async fetchJson(path: string, init?: RequestInit): Promise<unknown> {
    const headers = new Headers(init?.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(this.buildUrl(path), {
      credentials: "include",
      ...init,
      headers,
    });

    if (!response.ok) {
      const reason = await response.text();
      throw new Error(reason === "" ? "Request failed (" + String(response.status) + ")" : reason);
    }

    return response.json();
  }

  async getProfile(): Promise<IndividualTrackerProfileResponse> {
    const payload = await this.fetchJson("/api/individual-tracker/profile", { method: "GET" });
    return parseProfileResponse(payload);
  }

  async createProfile(request: IndividualTrackerCreateProfileRequest): Promise<IndividualTrackerCreateProfileResponse> {
    const payload = await this.fetchJson("/api/individual-tracker/profile", {
      method: "POST",
      body: JSON.stringify(request),
    });

    return parseCreateProfileResponse(payload);
  }

  async updateProfile(request: IndividualTrackerUpdateProfileRequest): Promise<IndividualTrackerUpdateProfileResponse> {
    const payload = await this.fetchJson("/api/individual-tracker/profile", {
      method: "PATCH",
      body: JSON.stringify(request),
    });

    return parseUpdateProfileResponse(payload);
  }

  async addGame(request: IndividualTrackerMutateGamesRequest): Promise<IndividualTrackerGamesResponse> {
    const payload = await this.fetchJson("/api/individual-tracker/games:add", {
      method: "POST",
      body: JSON.stringify(request),
    });

    return parseGamesResponse(payload);
  }

  async removeGame(request: IndividualTrackerMutateGamesRequest): Promise<IndividualTrackerGamesResponse> {
    const payload = await this.fetchJson("/api/individual-tracker/games:remove", {
      method: "POST",
      body: JSON.stringify(request),
    });

    return parseGamesResponse(payload);
  }

  async reorderGames(request: IndividualTrackerReorderGamesRequest): Promise<IndividualTrackerGamesResponse> {
    const payload = await this.fetchJson("/api/individual-tracker/games:reorder", {
      method: "POST",
      body: JSON.stringify(request),
    });

    return parseGamesResponse(payload);
  }
}
