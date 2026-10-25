import React from "react";
import { ColorSelector } from "../../../motion/components/primitives";
import { ToolcraftSelectControl as Selector, ToolcraftText as Text } from "@openreel/ui";
import { useProjectStore } from "../../../stores/project-store";
import { InspectorSection as Section } from "./shell/InspectorSection";
import { cssColorAlpha, cssColorToHex, rgbaFromHex } from "./inspector-color-utils";
import type { useInspectorSelection } from "./useInspectorSelection";

type SelectedSubtitle = NonNullable<ReturnType<typeof useInspectorSelection>["selectedSubtitle"]>;
type Props = { selectedSubtitle: SelectedSubtitle };

export const SubtitleColorControls: React.FC<Props> = ({ selectedSubtitle }) => {
  const updateSubtitle = useProjectStore((state) => state.updateSubtitle);
  return (
            <Section title="Colors">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Text type="supporting" color="secondary" className="text-[10px]">
                    Text Color
                  </Text>
                  <div className="flex items-center gap-2">
                    <ColorSelector
                      value={selectedSubtitle.style?.color || "#ffffff"}
                      label="Select subtitle text color"
                      onChange={(color) =>
                        updateSubtitle(selectedSubtitle.id, {
                          style: {
                            ...(selectedSubtitle.style || {}),
                            color,
                          } as typeof selectedSubtitle.style,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Text type="supporting" color="secondary" className="text-[10px]">
                    Background
                  </Text>
                  <div className="flex items-center gap-2">
                    <ColorSelector
                      value={cssColorToHex(
                        selectedSubtitle.style?.backgroundColor,
                        "#000000",
                      )}
                      label="Select subtitle background color"
                      onChange={(hex) => {
                        updateSubtitle(selectedSubtitle.id, {
                          style: {
                            ...(selectedSubtitle.style || {}),
                            backgroundColor: rgbaFromHex(
                              hex,
                              cssColorAlpha(
                                selectedSubtitle.style?.backgroundColor,
                              ),
                            ),
                          } as typeof selectedSubtitle.style,
                        });
                      }}
                    />
                    <Selector
                      label="Background opacity"
                      isLabelHidden
                      value={
                        cssColorAlpha(selectedSubtitle.style?.backgroundColor)
                      }
                      onChange={(v) => {
                        const nextAlpha = v as "0" | "0.5" | "0.7" | "1";
                        const newBg = rgbaFromHex(
                          cssColorToHex(
                            selectedSubtitle.style?.backgroundColor,
                            "#000000",
                          ),
                          nextAlpha,
                        );
                        updateSubtitle(selectedSubtitle.id, {
                          style: {
                            ...(selectedSubtitle.style || {}),
                            backgroundColor: newBg,
                          } as typeof selectedSubtitle.style,
                        });
                      }}
                      options={[
                        { value: "0", label: "None" },
                        { value: "0.5", label: "50%" },
                        { value: "0.7", label: "70%" },
                        { value: "1", label: "100%" },
                      ]}
                      size="sm"
                      width={80}
                    />
                  </div>
                </div>
              </div>
            </Section>

  );
};
