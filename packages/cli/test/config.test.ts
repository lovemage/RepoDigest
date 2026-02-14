import { describe, expect, it } from "vitest";
import { parseConfigString } from "../src/config.js";

describe("config", () => {
  it("applies defaults for empty yaml", () => {
    const config = parseConfigString("");
    expect(config.timezone).toBe("UTC");
    expect(config.output.target).toBe("internal");
    expect(config.providers.github.tokenEnv).toBe("GITHUB_TOKEN");
    expect(config.summaries.defaultProfile).toBe("team");
    expect(config.summaries.profiles.team.style).toBe("professional");
    expect(config.summaries.profiles.cus.style).toBe("natural");
  });

  it("rejects invalid repo format", () => {
    expect(() =>
      parseConfigString(`
scope:
  repos:
    - invalid-repo
`)
    ).toThrowError(/Repo format must be owner\/name/);
  });
});
