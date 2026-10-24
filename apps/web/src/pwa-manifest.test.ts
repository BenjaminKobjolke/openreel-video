import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("./../public/manifest.json", import.meta.url)), "utf8"),
);

describe("PWA manifest", () => {
  it("allows both portrait and landscape when installed", () => {
    expect(manifest.orientation).toBe("any");
  });
});
