import React from "react";
import { Shuffle } from "@/icons/lucide-compat";
import { getMediaItemCapabilities, type Transform } from "@openreel/core";
import { ToolcraftCard as Card, ToolcraftText as Text } from "@openreel/ui";
import { useProjectStore } from "../../../stores/project-store";
import { useUIStore } from "../../../stores/ui-store";
import type { InspectorClipType } from "./clip-tabs.config";
import { InspectorTabErrorBoundary } from "./shell/InspectorTabErrorBoundary";
import { InspectorSection as Section } from "./shell/InspectorSection";
import { ColorTab } from "./tabs/ColorTab";
import { AudioTab } from "./tabs/AudioTab";
import { TransformTab } from "./tabs/TransformTab";
import { SpeedTab } from "./tabs/SpeedTab";
import { AnimateTab } from "./tabs/AnimateTab";
import { StyleTab } from "./tabs/StyleTab";
import { EffectsTab } from "./tabs/EffectsTab";
import { AiTab } from "./tabs/AiTab";
import { TransitionInspector } from "./TransitionInspector";
import { MultiClipInspector } from "./MultiClipInspector";
import { QuickEditBar } from "../QuickEditBar";
import { SubtitleInspector } from "./SubtitleInspector";
import { InspectorEmptyState } from "./InspectorEmptyState";
import type { useInspectorSelection } from "./useInspectorSelection";
import type { useInspectorClipActions } from "./useInspectorClipActions";
import type { useChromaKeyControls } from "./useChromaKeyControls";
import type { useSubtitleImport } from "./useSubtitleImport";
import type { useRecipeControls } from "./useRecipeControls";

const MultiCameraPanel = React.lazy(() => import("./MultiCameraPanel"));

type Selection = ReturnType<typeof useInspectorSelection>;
type StoreState = ReturnType<typeof useProjectStore.getState>;
type Props = {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  selection: Selection;
  actions: ReturnType<typeof useInspectorClipActions>;
  chromaControls: ReturnType<typeof useChromaKeyControls>;
  subtitleImport: ReturnType<typeof useSubtitleImport>;
  recipeControls: ReturnType<typeof useRecipeControls>;
  customFonts: string[];
  clipId: string;
  clipType: InspectorClipType | null;
  tabIds: string[];
  transform: Transform;
  storeActions: Pick<StoreState, "updateClipTransition" | "removeClipTransition" | "updateSubtitle" | "getEditingTemplate" | "removeEditingTemplateApplication">;
};

export const InspectorClipTabs: React.FC<Props> = ({ scrollRef, selection, actions, chromaControls, subtitleImport, recipeControls, customFonts, clipId, clipType, tabIds, transform, storeActions }) => {
  const { project, selectedClipIds, selectedSubtitle, selectedTransition, transitionClipA, transitionClipB, selectedTimelineClip, selectedClip } = selection;
  const { handleEnhanceAudio, isEnhancingAudio, handleTransformChange, handleRemoveBackground, handleAutoColor, audioEnhanced, isApplyingSelectedClipEffect } = actions;
  const { chromaKeySettings, handleChromaKeyToggle, handleKeyColorChange, handleToleranceChange } = chromaControls;
  const { handleSRTImport, srtInputRef, handleSubtitleFontUpload, captionWordsPerLine, setCaptionWordsPerLine } = subtitleImport;
  const { expandedRecipeApplicationId, setExpandedRecipeApplicationId, recipeControlValues, setRecipeControlValues, handleRecipeControlChange, handleToggleRecipeControls, handleResetRecipeControls, handleUpdateRecipeControls } = recipeControls;
  const { updateClipTransition, removeClipTransition, getEditingTemplate, removeEditingTemplateApplication } = storeActions;
  const clearSelection = useUIStore((state) => state.clearSelection);
  const showVideoEffects = clipType === "video" || clipType === "image" || clipType === "text" || clipType === "shape" || clipType === "svg" || clipType === "sticker";
  const showColorGrading = clipType === "video" || clipType === "image";
  const selectedMediaCapabilities = getMediaItemCapabilities(selectedTimelineClip ? project.mediaLibrary.items.find((item) => item.id === selectedTimelineClip.mediaId) : undefined);
  const showAudioEffects = clipType === "audio" || selectedMediaCapabilities.audio;
  const showTextSection = clipType === "text";
  const showShapeSection = clipType === "shape";
  const showSVGSection = clipType === "svg";
  const selectedNoiseReductionEffect = selectedTimelineClip?.audioEffects?.find((effect) => effect.type === "noiseReduction");
  const noiseReductionSectionTitle = selectedNoiseReductionEffect ? selectedNoiseReductionEffect.enabled ? "Background Noise Removal (Active)" : "Background Noise Removal (Configured)" : "Background Noise Removal";
  const appliedEditingTemplates = selectedTimelineClip?.metadata?.appliedTemplates || [];
  const showVideoControls = clipType === "video" || clipType === "image";
  const showTransformControls = showVideoEffects;
  const chromaKeyEnabled = chromaKeySettings?.enabled || false;
  const keyColor = chromaKeySettings ? `#${Math.round(chromaKeySettings.keyColor.r * 255).toString(16).padStart(2, "0")}${Math.round(chromaKeySettings.keyColor.g * 255).toString(16).padStart(2, "0")}${Math.round(chromaKeySettings.keyColor.b * 255).toString(16).padStart(2, "0")}` : "#00ff00";
  const tolerance = (chromaKeySettings?.tolerance || 0.3) * 100;
  return (      <div ref={scrollRef} className="overflow-y-auto flex-1 min-h-0 custom-scrollbar">
      <div className="py-[18px] px-5">
        {selectedTimelineClip && selectedClipIds.length === 1 && (
          <QuickEditBar clipId={selectedTimelineClip.id} onCleanAudio={handleEnhanceAudio} isCleaningAudio={isEnhancingAudio} />
        )}
        <Section title="Multi-Camera Editing" sectionId="multicam">
          <InspectorTabErrorBoundary>
            <React.Suspense fallback={<p role="status">Loading camera tools…</p>}>
              <MultiCameraPanel key={project.id} />
            </React.Suspense>
          </InspectorTabErrorBoundary>
        </Section>
        {selectedClipIds.length > 1 ? (
          <MultiClipInspector clipIds={selectedClipIds} />
        ) : selectedClip ? (
          <InspectorTabErrorBoundary key={clipId}>
            <div className="space-y-4">
              {tabIds.includes("transform") && (
                <div data-inspector-group="transform" className="space-y-4">
                  <TransformTab
                    clipId={clipId}
                    clipType={clipType}
                    selectedClip={selectedClip}
                    showTransformControls={showTransformControls}
                    showVideoControls={showVideoControls}
                    transform={transform}
                    canvasWidth={project.settings.width}
                    canvasHeight={project.settings.height}
                    handleTransformChange={handleTransformChange}
                  />
                </div>
              )}

              {tabIds.includes("style") && (
                <div data-inspector-group="style" className="space-y-4">
                  <StyleTab
                    clipId={clipId}
                    showTextSection={showTextSection}
                    showShapeSection={showShapeSection}
                    showSVGSection={showSVGSection}
                  />
                </div>
              )}

              {tabIds.includes("color") && (
                <div data-inspector-group="color" className="space-y-4">
                  <ColorTab clipId={clipId} showColorGrading={showColorGrading} />
                </div>
              )}

              {tabIds.includes("effects") && (
                <div data-inspector-group="effects" className="space-y-4">
                  <EffectsTab
                    clipId={clipId}
                    clipType={clipType}
                    selectedClip={selectedClip}
                    selectedTimelineClip={selectedTimelineClip}
                    showVideoControls={showVideoControls}
                    showVideoEffects={showVideoEffects}
                    showTextSection={showTextSection}
                    appliedEditingTemplates={appliedEditingTemplates}
                    getEditingTemplate={getEditingTemplate}
                    removeEditingTemplateApplication={removeEditingTemplateApplication}
                    expandedRecipeApplicationId={expandedRecipeApplicationId}
                    setExpandedRecipeApplicationId={setExpandedRecipeApplicationId}
                    recipeControlValues={recipeControlValues}
                    setRecipeControlValues={setRecipeControlValues}
                    handleRecipeControlChange={handleRecipeControlChange}
                    handleToggleRecipeControls={handleToggleRecipeControls}
                    handleResetRecipeControls={handleResetRecipeControls}
                    handleUpdateRecipeControls={handleUpdateRecipeControls}
                    chromaKeyEnabled={chromaKeyEnabled}
                    keyColor={keyColor}
                    tolerance={tolerance}
                    handleChromaKeyToggle={handleChromaKeyToggle}
                    handleKeyColorChange={handleKeyColorChange}
                    handleToleranceChange={handleToleranceChange}
                  />
                </div>
              )}

              {tabIds.includes("audio") && (
                <div data-inspector-group="audio" className="space-y-4">
                  <AudioTab
                    clipId={clipId}
                    clipType={clipType}
                    showAudioEffects={showAudioEffects}
                    noiseReductionSectionTitle={noiseReductionSectionTitle}
                    selectedNoiseReductionEffect={selectedNoiseReductionEffect}
                  />
                </div>
              )}

              {tabIds.includes("speed") && (
                <div data-inspector-group="speed" className="space-y-4">
                  <SpeedTab
                    showVideoControls={showVideoControls}
                    selectedClip={selectedClip}
                  />
                </div>
              )}

              {tabIds.includes("animate") && (
                <div data-inspector-group="animate" className="space-y-4">
                  <AnimateTab
                    clipId={clipId}
                    clipType={clipType}
                    showTextSection={showTextSection}
                  />
                </div>
              )}

              {tabIds.includes("ai") && (
                <div data-inspector-group="ai" className="space-y-4">
                  <AiTab
                    clipId={clipId}
                    clipType={clipType}
                    showVideoControls={showVideoControls}
                    showAudioEffects={showAudioEffects}
                    showVideoEffects={showVideoEffects}
                    handleSRTImport={handleSRTImport}
                    srtInputRef={srtInputRef}
                    handleRemoveBackground={handleRemoveBackground}
                    handleEnhanceAudio={handleEnhanceAudio}
                    handleAutoColor={handleAutoColor}
                    isEnhancingAudio={isEnhancingAudio}
                    audioEnhanced={audioEnhanced}
                    isApplyingSelectedClipEffect={isApplyingSelectedClipEffect}
                    captionWordsPerLine={captionWordsPerLine}
                    onCaptionWordsPerLineChange={setCaptionWordsPerLine}
                  />
                </div>
              )}
            </div>
          </InspectorTabErrorBoundary>
        ) : selectedTransition && transitionClipA ? (
          <div className="space-y-3">
            <Card variant="green" padding={3} className="rounded-lg border border-accent/30 bg-accent-soft">
              <div className="flex items-center gap-2">
                <Shuffle size={14} className="text-accent" aria-hidden />
                <Text type="supporting" weight="bold" className="text-fg">
                  {selectedTransition.edge === "in"
                    ? "Intro Transition"
                    : selectedTransition.edge === "out"
                      ? "Outro Transition"
                      : "Transition"}
                </Text>
              </div>
              <Text type="supporting" display="block" className="mt-1 text-[10px] text-fg-3">
                {selectedTransition.edge === "in"
                  ? "From the project background into this clip"
                  : selectedTransition.edge === "out"
                    ? "From this clip into the project background"
                    : "Between two clips - centered on the cut"}
              </Text>
            </Card>
            <TransitionInspector
              clipA={transitionClipA}
              clipB={transitionClipB ?? undefined}
              edge={selectedTransition.edge}
              transition={selectedTransition}
              onTransitionUpdate={(id, updates) => {
                void updateClipTransition(id, updates);
              }}
              onTransitionRemove={(id) => {
                void removeClipTransition(id);
                clearSelection();
              }}
            />
          </div>
        ) : selectedSubtitle ? (
          <SubtitleInspector selectedSubtitle={selectedSubtitle} customFonts={customFonts} handleSubtitleFontUpload={handleSubtitleFontUpload} />
        ) : (
          <InspectorEmptyState />
        )}
      </div>
      </div>

  );
};
