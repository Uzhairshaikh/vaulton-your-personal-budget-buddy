import { describe, expect, it } from "vitest";

describe("VaultOn brand metadata", () => {
  it("exposes the configured website title", () => {
    expect(process.env.VITE_APP_TITLE).toBe("VaultOn");
  });
});
