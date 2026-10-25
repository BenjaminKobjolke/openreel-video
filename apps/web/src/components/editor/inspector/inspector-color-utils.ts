const componentToHex = (value: number): string =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");

export const cssColorToHex = (value: string | undefined, fallback: string): string => {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
    if (trimmed.length === 4) {
      const [, r, g, b] = trimmed;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return trimmed.toLowerCase();
  }

  const rgba = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (!rgba) return fallback;

  return `#${componentToHex(Number(rgba[1]))}${componentToHex(
    Number(rgba[2]),
  )}${componentToHex(Number(rgba[3]))}`;
};

export const cssColorAlpha = (
  value: string | undefined,
  fallback: "0" | "0.5" | "0.7" | "1" = "0.7",
): "0" | "0.5" | "0.7" | "1" => {
  const alpha = value?.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/i)?.[1];
  if (alpha === "0" || alpha === "0.5" || alpha === "0.7" || alpha === "1") {
    return alpha;
  }
  return fallback;
};

export const rgbaFromHex = (hex: string, alpha: string): string => {
  const value = cssColorToHex(hex, "#000000");
  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
