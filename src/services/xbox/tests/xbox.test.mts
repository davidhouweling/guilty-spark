import { before, describe, it } from "node:test";
import { XboxService } from "../xbox.mjs";
import assert from "node:assert";
import { aFakeEnvWith } from "../../../base/fakes/env.mjs";

await describe("Xbox Service", async () => {
  let env: Env;

  await describe("loadCredentials", async () => {
    before(() => {
      env = aFakeEnvWith();
    });

    await it("should load credentials from the environment", async () => {
      const service = new XboxService({ env });
      await service.loadCredentials();

      assert.equal(service.token, "token");
    });
  });
});
