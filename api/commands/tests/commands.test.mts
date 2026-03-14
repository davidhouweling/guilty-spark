import { describe, it, beforeEach, expect } from "vitest";
import { getCommands } from "../commands.mjs";
import { installFakeServicesWith } from "../../services/fakes/services.mjs";
import { aFakeEnvWith } from "../../base/fakes/env.fake.mjs";

describe("getCommands", () => {
  let env: Env;
  let commandMap: Map<string, unknown>;

  beforeEach(() => {
    env = aFakeEnvWith();
    const services = installFakeServicesWith({ env });
    commandMap = getCommands(services, env);
  });

  it("returns a map of commands", () => {
    expect(commandMap).toBeInstanceOf(Map);
    expect(commandMap.size).toBeGreaterThan(0);
  });

  it("registers chat input commands by name", () => {
    const connectCommand = commandMap.get("connect");
    expect(connectCommand).toBeDefined();

    const statsCommand = commandMap.get("stats");
    expect(statsCommand).toBeDefined();

    const mapsCommand = commandMap.get("maps");
    expect(mapsCommand).toBeDefined();

    const setupCommand = commandMap.get("setup");
    expect(setupCommand).toBeDefined();

    const trackCommand = commandMap.get("track");
    expect(trackCommand).toBeDefined();

    const serviceRecordCommand = commandMap.get("servicerecord");
    expect(serviceRecordCommand).toBeDefined();
  });

  it("all commands have required data property", () => {
    for (const command of commandMap.values()) {
      expect(command).toHaveProperty("data");
      expect(Array.isArray((command as { data: unknown }).data)).toBe(true);
    }
  });
});
