import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("./editor-responsive.css", import.meta.url)), "utf8");

function getRule(selector: string, stylesheet = css): string {
  const cssWithoutComments = stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = cssWithoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g);

  for (const [, ruleSelector, declarations] of rules) {
    if (ruleSelector.trim() === selector) {
      return declarations;
    }
  }

  return "";
}

describe("editor-responsive.css", () => {
  it("keeps compact preview tools in a horizontally scrolling row", () => {
    const toolsRule = getRule(".editor-compact [data-preview-tools]");

    expect(toolsRule).toContain("overflow-x: auto");
    expect(toolsRule).toContain("overflow-y: hidden");
    expect(toolsRule).toContain("flex-wrap: nowrap");
    expect(toolsRule).not.toContain("flex-wrap: wrap");
  });

  it("does not match a selector inside a grouped rule", () => {
    const groupedRule = ".other, .editor-compact [data-preview-tools] { overflow-x: auto; }";

    expect(getRule(".editor-compact [data-preview-tools]", groupedRule)).toBe("");
  });

  it("anchors compact preview dropdowns outside the scrolling tools row", () => {
    expect(getRule(".editor-compact [data-preview-tools] > .relative")).toContain("position: static");
    expect(getRule(".editor-compact [data-preview-transport]")).toContain("position: relative");
  });

  it("keeps expanded preview controls visible in landscape", () => {
    const landscapeRule = getRule(
      '.editor-compact [data-tour="preview"]:not([data-player-expanded="true"]) > .shrink-0',
    );

    expect(landscapeRule).toContain("display: none");
  });

  it("gives the compact scrub bar a 24px touch target", () => {
    expect(getRule(".editor-compact [data-preview-scrub]")).toContain("padding-block: 9px");
  });
});
