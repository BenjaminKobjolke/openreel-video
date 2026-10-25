import React from "react";
import { Captions } from "@/icons/lucide-compat";
import { ToolcraftButton as Button, ToolcraftCard as Card, ToolcraftFileDropControl as FileInput, ToolcraftNumberInputControl, ToolcraftSelectableCard as SelectableCard, ToolcraftSelectControl as Selector, ToolcraftText as Text, ToolcraftTextAreaControl } from "@openreel/ui";
import { useProjectStore } from "../../../stores/project-store";
import { InspectorSection as Section } from "./shell/InspectorSection";
import { FONT_CATEGORIES, FONT_FILE_ACCEPT } from "./font-options";
import type { useInspectorSelection } from "./useInspectorSelection";
import { SubtitleAnimationControls } from "./SubtitleAnimationControls";
import { SubtitleColorControls } from "./SubtitleColorControls";

type SelectedSubtitle = NonNullable<ReturnType<typeof useInspectorSelection>["selectedSubtitle"]>;

type Props = {
  selectedSubtitle: SelectedSubtitle;
  customFonts: string[];
  handleSubtitleFontUpload: (file: File) => Promise<void>;
};

export const SubtitleInspector: React.FC<Props> = ({ selectedSubtitle, customFonts, handleSubtitleFontUpload }) => {
  const updateSubtitle = useProjectStore((state) => state.updateSubtitle);
  return (          <>
            {/* Subtitle Info */}
            <Card variant="green" padding={3} className="mb-4 rounded-lg border border-accent/30 bg-accent-soft">
              <div className="flex items-center gap-2 mb-1">
                <Captions size={14} className="text-accent" aria-hidden />
                <Text type="supporting" weight="bold" className="text-accent">
                  Subtitle
                </Text>
              </div>
              <Text type="supporting" display="block" className="text-[10px] text-fg-3">
                {selectedSubtitle.startTime.toFixed(2)}s -{" "}
                {selectedSubtitle.endTime.toFixed(2)}s
              </Text>
            </Card>

            {/* Subtitle Text Editor */}
            <Section title="Text Content">
              <div className="space-y-3">
                <ToolcraftTextAreaControl
                  label="Subtitle text"
                  isLabelHidden
                  value={selectedSubtitle.text}
                  onChange={(text) =>
                    updateSubtitle(selectedSubtitle.id, {
                      text,
                    })
                  }
                  rows={4}
                  placeholder="Enter subtitle text..."
                  width="100%"
                />
              </div>
            </Section>

            {/* Subtitle Timing */}
            <Section title="Timing">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Text type="supporting" color="secondary" className="text-[10px]">
                    Start Time
                  </Text>
                  <ToolcraftNumberInputControl
                    label="Start Time"
                    isLabelHidden
                    step={0.1}
                    value={selectedSubtitle.startTime}
                    onChange={(value) =>
                      updateSubtitle(selectedSubtitle.id, {
                        startTime: value || 0,
                      })
                    }
                    size="sm"
                    width={80}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Text type="supporting" color="secondary" className="text-[10px]">
                    End Time
                  </Text>
                  <ToolcraftNumberInputControl
                    label="End Time"
                    isLabelHidden
                    step={0.1}
                    value={selectedSubtitle.endTime}
                    onChange={(value) =>
                      updateSubtitle(selectedSubtitle.id, {
                        endTime: value || 0,
                      })
                    }
                    size="sm"
                    width={80}
                  />
                </div>
              </div>
            </Section>

            {/* Subtitle Position */}
            <Section title="Position">
              <div className="grid grid-cols-3 gap-2">
                {(["top", "center", "bottom"] as const).map((pos) => (
                  <SelectableCard
                    key={pos}
                    label={pos}
                    isSelected={(selectedSubtitle.style?.position || "bottom") === pos}
                    onChange={() =>
                      updateSubtitle(selectedSubtitle.id, {
                        style: {
                          ...(selectedSubtitle.style || {}),
                          position: pos,
                        } as typeof selectedSubtitle.style,
                      })
                    }
                    padding={2}
                    variant={(selectedSubtitle.style?.position || "bottom") === pos ? "green" : "muted"}
                    className="text-center capitalize"
                  >
                    {pos}
                  </SelectableCard>
                ))}
              </div>
            </Section>

            <SubtitleAnimationControls selectedSubtitle={selectedSubtitle} />            {/* Subtitle Font Settings */}
            <Section title="Font">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Text type="supporting" color="secondary" className="text-[10px]">
                    Font Family
                  </Text>
                  <Selector
                    label="Font family"
                    isLabelHidden
                    value={selectedSubtitle.style?.fontFamily || "Inter"}
                    onChange={(v) =>
                      updateSubtitle(selectedSubtitle.id, {
                        style: {
                          ...(selectedSubtitle.style || {}),
                          fontFamily: v,
                        } as typeof selectedSubtitle.style,
                      })
                    }
                    options={[
                      ...Object.entries(FONT_CATEGORIES).flatMap(([category, fonts]) =>
                        fonts.map((font) => ({
                          value: font,
                          label: `${font} (${category})`,
                        })),
                      ),
                      ...customFonts.map((font) => ({
                        value: font,
                        label: `${font} (Custom)`,
                      })),
                    ]}
                    size="sm"
                    width={160}
                  />
                </div>
                <FileInput
                  label="Upload Custom Font"
                  isLabelHidden
                  value={null}
                  onChange={(picked) => {
                    if (picked instanceof File) {
                      void handleSubtitleFontUpload(picked);
                    }
                  }}
                  accept={FONT_FILE_ACCEPT}
                  mode="input"
                  placeholder="Upload Custom Font"
                  width="100%"
                />
                <div className="flex items-center justify-between">
                  <Text type="supporting" color="secondary" className="text-[10px]">
                    Font Size
                  </Text>
                  <ToolcraftNumberInputControl
                    label="Font Size"
                    isLabelHidden
                    min={12}
                    max={72}
                    value={selectedSubtitle.style?.fontSize || 24}
                    onChange={(value) =>
                      updateSubtitle(selectedSubtitle.id, {
                        style: {
                          ...(selectedSubtitle.style || {}),
                          fontSize: value || 24,
                        } as typeof selectedSubtitle.style,
                      })
                    }
                    size="sm"
                    width={80}
                  />
                </div>
              </div>
            </Section>

            <SubtitleColorControls selectedSubtitle={selectedSubtitle} />            {/* Delete Subtitle */}
            <div className="pt-4 border-t border-border">
              <Button
                label="Delete Subtitle"
                onClick={() => {
                  const { removeSubtitle } = useProjectStore.getState();
                  removeSubtitle(selectedSubtitle.id);
                }}
                variant="destructive"
                className="w-full border border-red-500/30 bg-red-500/20 text-red-400 hover:bg-red-500/30"
              />
            </div>
          </>
  );
};
