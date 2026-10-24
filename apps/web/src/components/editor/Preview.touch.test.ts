import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const preview = readFileSync(fileURLToPath(new URL("./Preview.tsx", import.meta.url)), "utf8");

describe("Preview touch interactions", () => {
  it("does not put an expand button over the player", () => {
    expect(preview).not.toContain('aria-label="Expand player"');
  });

  it("uses pointer events for clip transforms and releases", () => {
    expect(preview).not.toMatch(/onMouseDown=/);
    expect(preview).not.toMatch(/onMouseUp=/);
    expect(preview).not.toContain('addEventListener("mouseup"');
    expect(preview).toContain("onPointerDown={handleClipMouseDown}");
    expect(preview).toContain("onPointerMove={interactionMode !== \"none\" ? handleMouseMove : undefined}");
    expect(preview).toContain("onPointerUp={handleMouseUp}");
    expect(preview).toContain('addEventListener("pointerup"');
    expect(preview).toContain('addEventListener("pointercancel"');
  });
});
