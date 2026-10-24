import "../test/install-local-storage-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("theme store initial theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    delete document.documentElement.dataset.theme;
  });

  const loadStore = async (systemIsDark: boolean) => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: systemIsDark,
      addEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;

    vi.resetModules();
    return import("./theme-store");
  };

  it("uses the system dark theme when no theme has been stored", async () => {
    const { useThemeStore } = await loadStore(true);

    expect(useThemeStore.getState().mode).toBe("auto");
    expect(useThemeStore.getState().isDark).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("uses the system light theme when no theme has been stored", async () => {
    const { useThemeStore } = await loadStore(false);

    expect(useThemeStore.getState().mode).toBe("auto");
    expect(useThemeStore.getState().isDark).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("keeps a stored light theme when the system theme is dark", async () => {
    localStorage.setItem(
      "openreel-theme",
      JSON.stringify({ state: { mode: "light" }, version: 0 }),
    );

    const { useThemeStore } = await loadStore(true);

    expect(useThemeStore.getState().mode).toBe("light");
    expect(useThemeStore.getState().isDark).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
