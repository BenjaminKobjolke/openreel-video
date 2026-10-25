import { useCallback, useRef, useState } from "react";
import type React from "react";
import { useProjectStore } from "../../../stores/project-store";
import { toast } from "../../../stores/notification-store";
import { registerCustomFont } from "./font-options";
import type { useInspectorSelection } from "./useInspectorSelection";

type SelectedSubtitle = ReturnType<typeof useInspectorSelection>["selectedSubtitle"];

export function useSubtitleImport(
  selectedTimelineClip: { id: string } | null,
  selectedSubtitle: SelectedSubtitle,
) {
  const importSRT = useProjectStore((state) => state.importSRT);
  const updateSubtitle = useProjectStore((state) => state.updateSubtitle);
  const [captionWordsPerLine, setCaptionWordsPerLine] = useState(5);
  const srtInputRef = useRef<HTMLInputElement>(null);

  const handleSRTImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const srtContent = await file.text();
        const result = await importSRT(srtContent, {
          sourceClipId: selectedTimelineClip?.id,
          maxWordsPerLine: captionWordsPerLine,
        });

        if (result.success) {
          if (result.errors.length > 0) {
            toast.warning(
              "Captions imported with warnings",
              `${result.errors.length} subtitle segment(s) were skipped.`,
            );
          } else {
            toast.success(
              "Captions imported",
              "Each cue is now an editable text clip on the Captions track.",
            );
          }
        } else {
          toast.error("Caption import failed", result.errors[0] || "No valid captions found.");
        }
      } catch {
        toast.error("Caption import failed", "Could not read the selected subtitle file.");
      } finally {
        event.target.value = "";
      }
    },
    [captionWordsPerLine, importSRT, selectedTimelineClip?.id],
  );

  const handleSubtitleFontUpload = useCallback(
    async (file: File) => {
      if (!file || !selectedSubtitle) return;

      const result = await registerCustomFont(file);
      if (!result.success) {
        toast.error("Font upload failed", result.error ?? "Unknown error.");
      } else {
        updateSubtitle(selectedSubtitle.id, {
          style: {
            ...(selectedSubtitle.style || {}),
            fontFamily: result.fontFamily,
          } as NonNullable<SelectedSubtitle>["style"],
        });
        toast.success("Custom font uploaded", `${result.fontFamily} is ready to use.`);
      }
    },
    [selectedSubtitle, updateSubtitle],
  );

  return {
    captionWordsPerLine,
    setCaptionWordsPerLine,
    srtInputRef,
    handleSRTImport,
    handleSubtitleFontUpload,
  };
}
