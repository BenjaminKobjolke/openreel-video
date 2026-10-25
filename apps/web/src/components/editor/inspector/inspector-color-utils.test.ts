import { describe, expect, it } from "vitest";
import { cssColorAlpha, cssColorToHex, rgbaFromHex } from "./inspector-color-utils";

describe("inspector color utilities", () => {
  it("expands short hex and normalizes long hex", () => {
    expect(cssColorToHex(" #AbC ", "#000000")).toBe("#aabbcc");
    expect(cssColorToHex("#12ABef", "#000000")).toBe("#12abef");
  });

  it("converts rgb and rgba strings to hex", () => {
    expect(cssColorToHex("rgb(12, 34, 56)", "#000000")).toBe("#0c2238");
    expect(cssColorToHex("rgba(255, 128, 0, 0.5)", "#000000")).toBe("#ff8000");
  });

  it("uses the fallback for absent or unsupported colors", () => {
    expect(cssColorToHex(undefined, "#123456")).toBe("#123456");
    expect(cssColorToHex("not a color", "#123456")).toBe("#123456");
  });

  it("accepts only the supported alpha values", () => {
    expect(cssColorAlpha("rgba(1, 2, 3, 0.5)")).toBe("0.5");
    expect(cssColorAlpha("rgba(1, 2, 3, 0.7)")).toBe("0.7");
    expect(cssColorAlpha("rgba(1, 2, 3, 0)")).toBe("0");
    expect(cssColorAlpha("rgba(1, 2, 3, 1)")).toBe("1");
    expect(cssColorAlpha("rgba(1, 2, 3, 0.3)")).toBe("0.7");
    expect(cssColorAlpha(undefined, "0.5")).toBe("0.5");
  });

  it("converts hex colors back to rgba", () => {
    expect(rgbaFromHex("#AbC", "0.7")).toBe("rgba(170, 187, 204, 0.7)");
  });
});
