import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const preview = readFileSync(fileURLToPath(new URL("./Preview.tsx", import.meta.url)), "utf8");
const stage = readFileSync(fileURLToPath(new URL("./preview/PreviewStage.tsx", import.meta.url)), "utf8");
const transformOverlays = readFileSync(fileURLToPath(new URL("./preview/PreviewTransformOverlays.tsx", import.meta.url)), "utf8");
const controlBar = readFileSync(fileURLToPath(new URL("./preview/PreviewControlBar.tsx", import.meta.url)), "utf8");
const bounds = readFileSync(fileURLToPath(new URL("./preview/usePreviewBounds.ts", import.meta.url)), "utf8");
const pointer = readFileSync(fileURLToPath(new URL("./preview/usePreviewPointer.ts", import.meta.url)), "utf8");
const pointerMove = readFileSync(fileURLToPath(new URL("./preview/usePreviewPointerMove.ts", import.meta.url)), "utf8");
const nudge = readFileSync(fileURLToPath(new URL("./preview/usePreviewKeyboardNudge.ts", import.meta.url)), "utf8");
const setup = readFileSync(fileURLToPath(new URL("./preview/usePreviewSetup4.ts", import.meta.url)), "utf8");
const previewHeader = readFileSync(fileURLToPath(new URL("./preview/PreviewHeader.tsx", import.meta.url)), "utf8");
const interactionSources = [preview, stage, transformOverlays, controlBar, previewHeader, bounds, pointer, pointerMove, nudge, setup].join("\n");

describe("Preview touch interactions", () => {
  it("does not put an expand button over the player", () => {
    expect(preview).not.toContain('aria-label="Expand player"');
  });

  it("uses pointer events for clip transforms and releases", () => {
    expect(interactionSources).not.toMatch(/onMouseDown=/);
    expect(interactionSources).not.toMatch(/onMouseUp=/);
    expect(interactionSources).not.toContain('addEventListener("mouseup"');
    expect(transformOverlays).toContain("onPointerDown={handleClipMouseDown}");
    expect(stage).toContain("onPointerMove={interactionMode !== \"none\" ? handleMouseMove : undefined}");
    expect(stage).toContain("onPointerUp={handleMouseUp}");
    expect(interactionSources).toContain('addEventListener("pointerup"');
    expect(interactionSources).toContain('addEventListener("pointercancel"');
  });

  it("derives timeline clip interaction transforms from the animated playhead value", () => {
    expect(setup).toMatch(/getTransformAtPlayhead\s*=\s*useCallback/);
    expect(setup).toMatch(/getAnimatedTransform\([\s\S]*?getClipLocalTime\(clip, playheadPosition\)/);

    const clipBounds = bounds.slice(
      bounds.indexOf("const clipBounds = useMemo"),
      bounds.indexOf("const textClipBounds = useMemo"),
    );
    expect(clipBounds).toContain("getTransformAtPlayhead(clip)");

    expect(nudge).toContain("getTransformAtPlayhead(clip)");

    expect(pointer).toContain("const handleHandleMouseDown = useCallback");
    expect(pointer).toContain("const handleClipMouseDown = useCallback");
    expect(pointer).toContain("getTransformAtPlayhead(clip)");
  });
});
