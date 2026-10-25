import { useCallback, useState } from "react";
import type { Transform } from "@openreel/core";
import { useProjectStore } from "../../../stores/project-store";
import { useShallow } from "zustand/react/shallow";
import { useTimelineStore } from "../../../stores/timeline-store";
import { useUIStore } from "../../../stores/ui-store";
import { toast } from "../../../stores/notification-store";
import {
  getAudioBridgeEffects,
  initializeAudioBridgeEffects,
  DEFAULT_NOISE_REDUCTION,
} from "../../../bridges/audio-bridge-effects";
import { getNoiseReductionPreset } from "./noise-reduction-presets";
import { useEngineStore } from "../../../stores/engine-store";
import { chromaKeyEngine } from "./useChromaKeyControls";

type SelectedClip = { id: string } | null;

export function useInspectorClipActions(
  selectedClip: SelectedClip,
  forceUpdate: () => void,
) {
  const getTitleEngine = useEngineStore((state) => state.getTitleEngine);
  const getGraphicsEngine = useEngineStore((state) => state.getGraphicsEngine);
  const updateClipTransform = useProjectStore((state) => state.updateClipTransform);
  const updateTextTransform = useProjectStore((state) => state.updateTextTransform);
  const updateShapeTransform = useProjectStore((state) => state.updateShapeTransform);
  const {
    addVideoEffect,
    updateVideoEffect,
    getAudioEffects,
    updateAudioEffect,
    toggleAudioEffect,
  } = useProjectStore(useShallow((state) => ({
    addVideoEffect: state.addVideoEffect,
    updateVideoEffect: state.updateVideoEffect,
    getAudioEffects: state.getAudioEffects,
    updateAudioEffect: state.updateAudioEffect,
    toggleAudioEffect: state.toggleAudioEffect,
  })));
  const pausePlayback = useTimelineStore((state) => state.pause);
  const lockPlayback = useTimelineStore((state) => state.lockPlayback);
  const unlockPlayback = useTimelineStore((state) => state.unlockPlayback);
  const effectApplicationClipId = useUIStore((state) => state.effectApplicationClipId);
  const startEffectApplication = useUIStore((state) => state.startEffectApplication);
  const finishEffectApplication = useUIStore((state) => state.finishEffectApplication);
  const [isEnhancingAudio, setIsEnhancingAudio] = useState(false);
  const [audioEnhanced, setAudioEnhanced] = useState(false);
  const isApplyingSelectedClipEffect =
    effectApplicationClipId !== null && effectApplicationClipId === selectedClip?.id;

  const handleTransformChange = useCallback((changes: Partial<Transform>) => {
    if (!selectedClip) return;
    const titleEngine = getTitleEngine();
    const graphicsEngine = getGraphicsEngine();
    if (titleEngine?.getTextClip(selectedClip.id)) {
      updateTextTransform(selectedClip.id, changes);
      return;
    }
    if (
      graphicsEngine?.getShapeClip(selectedClip.id) ||
      graphicsEngine?.getSVGClip(selectedClip.id) ||
      graphicsEngine?.getStickerClip(selectedClip.id)
    ) {
      updateShapeTransform(selectedClip.id, changes);
      return;
    }
    void updateClipTransform(selectedClip.id, changes);
  }, [getGraphicsEngine, getTitleEngine, selectedClip, updateClipTransform, updateShapeTransform, updateTextTransform]);

  const waitForEffectApplicationPaint = useCallback(
    () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    }),
    [],
  );

  const applyClipEffectWithPlaybackLock = useCallback(
    async (clipId: string, label: string, apply: () => void | Promise<void>) => {
      const store = useProjectStore.getState();
      const currentClip = store.getClip(clipId) ?? store.getTextClip(clipId) ??
        store.getShapeClip(clipId) ?? store.getSVGClip(clipId) ?? store.getStickerClip(clipId);
      const track = store.project.timeline.tracks.find((candidate) => candidate.id === currentClip?.trackId);
      if (!currentClip || !track || track.locked ||
        useUIStore.getState().exportState.isExporting ||
        useUIStore.getState().effectApplicationClipId !== null ||
        useTimelineStore.getState().playbackLockedReason) return;
      const projectId = store.project.id;
      pausePlayback();
      lockPlayback(label);
      startEffectApplication(clipId, label);

      try {
        await waitForEffectApplicationPaint();
        if (useProjectStore.getState().project.id !== projectId) return;
        await apply();
        window.dispatchEvent(new CustomEvent("openreel:preview-invalidate"));
        await waitForEffectApplicationPaint();
      } finally {
        if (useUIStore.getState().effectApplicationClipId === clipId) {
          finishEffectApplication();
          if (useTimelineStore.getState().playbackLockedReason === label) unlockPlayback();
        }
      }
    },
    [finishEffectApplication, lockPlayback, pausePlayback, startEffectApplication, unlockPlayback, waitForEffectApplicationPaint],
  );

  const handleRemoveBackground = useCallback(() => {
    if (!selectedClip) return;
    void applyClipEffectWithPlaybackLock(selectedClip.id, "Applying background removal", () => {
      chromaKeyEngine.enableChromaKey(selectedClip.id);
      chromaKeyEngine.setKeyColor(selectedClip.id, { r: 0, g: 1, b: 0 });
      chromaKeyEngine.setTolerance(selectedClip.id, 0.35);
      forceUpdate();
    });
  }, [applyClipEffectWithPlaybackLock, forceUpdate, selectedClip]);

  const handleEnhanceAudio = useCallback(async () => {
    if (!selectedClip) return;
    setIsEnhancingAudio(true);
    try {
      await applyClipEffectWithPlaybackLock(selectedClip.id, "Applying audio cleanup", async () => {
        await initializeAudioBridgeEffects();
        const bridge = getAudioBridgeEffects();
        const noiseCleanupConfig = {
          ...DEFAULT_NOISE_REDUCTION,
          ...getNoiseReductionPreset("speech").config,
        };
        const existingNoiseReduction = getAudioEffects(selectedClip.id).find(
          (effect) => effect.type === "noiseReduction",
        );
        if (existingNoiseReduction) {
          await updateAudioEffect(selectedClip.id, existingNoiseReduction.id,
            noiseCleanupConfig as unknown as Record<string, unknown>);
          await toggleAudioEffect(selectedClip.id, existingNoiseReduction.id, true);
        } else {
          const result = bridge.applyNoiseReduction(selectedClip.id, noiseCleanupConfig);
          if (!result.success) throw new Error(result.error ?? "Failed to apply noise cleanup");
        }
        setAudioEnhanced(true);
        setTimeout(() => setAudioEnhanced(false), 2000);
        toast.success("Noise cleanup applied", "Fine-tune or switch presets in Background Noise Removal.");
        forceUpdate();
      });
    } catch (error) {
      console.error("Failed to enhance audio:", error);
      toast.error("Could not clean up audio", error instanceof Error
        ? error.message
        : "Noise cleanup could not be applied to this clip.");
    } finally {
      setIsEnhancingAudio(false);
    }
  }, [applyClipEffectWithPlaybackLock, selectedClip, forceUpdate, getAudioEffects, toggleAudioEffect, updateAudioEffect]);

  const handleAutoColor = useCallback(async () => {
    if (!selectedClip) return;
    await applyClipEffectWithPlaybackLock(selectedClip.id, "Applying auto color", async () => {
      const satEffect = await addVideoEffect(selectedClip.id, "saturation");
      const contEffect = await addVideoEffect(selectedClip.id, "contrast");
      const brightEffect = await addVideoEffect(selectedClip.id, "brightness");
      if (satEffect) await updateVideoEffect(selectedClip.id, satEffect.id, { value: 1.15 });
      if (contEffect) await updateVideoEffect(selectedClip.id, contEffect.id, { value: 1.1 });
      if (brightEffect) await updateVideoEffect(selectedClip.id, brightEffect.id, { value: 5 });
    });
  }, [addVideoEffect, applyClipEffectWithPlaybackLock, selectedClip, updateVideoEffect]);

  return {
    handleTransformChange,
    handleRemoveBackground,
    handleEnhanceAudio,
    handleAutoColor,
    isEnhancingAudio,
    audioEnhanced,
    isApplyingSelectedClipEffect,
  };
}
