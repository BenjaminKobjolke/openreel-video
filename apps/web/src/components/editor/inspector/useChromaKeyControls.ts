import { useCallback, useMemo, useReducer } from "react";
import { ChromaKeyEngine } from "@openreel/core";

export const chromaKeyEngine = new ChromaKeyEngine({ width: 1920, height: 1080 });

export function useChromaKeyControls(selectedClip: { id: string } | null) {
  const [updateCounter, forceUpdate] = useReducer((x) => x + 1, 0);
  const clipId = selectedClip?.id || "";
  const chromaKeySettings = useMemo(() => {
    return clipId ? chromaKeyEngine.getSettings(clipId) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId, updateCounter]);

  const handleChromaKeyToggle = useCallback((enabled: boolean) => {
    if (!selectedClip) return;
    if (enabled) {
      chromaKeyEngine.enableChromaKey(selectedClip.id);
    } else {
      chromaKeyEngine.disableChromaKey(selectedClip.id);
    }
    forceUpdate();
  }, [selectedClip]);

  const handleKeyColorChange = useCallback((hexColor: string) => {
    if (!selectedClip) return;
    const hex = hexColor.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    chromaKeyEngine.setKeyColor(selectedClip.id, { r, g, b });
    forceUpdate();
  }, [selectedClip]);

  const handleToleranceChange = useCallback((tolerance: number) => {
    if (!selectedClip) return;
    chromaKeyEngine.setTolerance(selectedClip.id, tolerance / 100);
    forceUpdate();
  }, [selectedClip]);

  return {
    clipId,
    chromaKeySettings,
    forceUpdate,
    handleChromaKeyToggle,
    handleKeyColorChange,
    handleToleranceChange,
    engine: chromaKeyEngine,
  };
}
