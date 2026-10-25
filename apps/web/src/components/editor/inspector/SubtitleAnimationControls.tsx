import React from "react";
import type { CaptionAnimationStyle } from "@openreel/core";
import { CAPTION_ANIMATION_STYLES, getAnimationStyleDisplayName } from "@openreel/core";
import { ColorSelector } from "../../../motion/components/primitives";
import { ToolcraftButton as Button, ToolcraftCard as Card, ToolcraftSelectControl as Selector, ToolcraftText as Text } from "@openreel/ui";
import { useProjectStore } from "../../../stores/project-store";
import { InspectorSection as Section } from "./shell/InspectorSection";
import type { useInspectorSelection } from "./useInspectorSelection";

type SelectedSubtitle = NonNullable<ReturnType<typeof useInspectorSelection>["selectedSubtitle"]>;
type Props = { selectedSubtitle: SelectedSubtitle };

export const SubtitleAnimationControls: React.FC<Props> = ({ selectedSubtitle }) => {
  const updateSubtitle = useProjectStore((state) => state.updateSubtitle);
  return (
            <Section title="Animation">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Text type="supporting" color="secondary" className="text-[10px]">
                    Style
                  </Text>
                  <Selector
                    label="Animation style"
                    isLabelHidden
                    value={selectedSubtitle.animationStyle || "none"}
                    onChange={(v) =>
                      updateSubtitle(selectedSubtitle.id, {
                        animationStyle: v as CaptionAnimationStyle,
                      })
                    }
                    options={CAPTION_ANIMATION_STYLES.map((style) => ({
                      value: style,
                      label: getAnimationStyleDisplayName(style),
                    }))}
                    size="sm"
                    width={140}
                  />
                </div>
                <Text type="supporting" color="secondary" display="block" className="text-[9px]">
                  {selectedSubtitle.animationStyle === "karaoke" &&
                    "Words fill with color as they're spoken"}
                  {selectedSubtitle.animationStyle === "word-highlight" &&
                    "Current word is highlighted and scaled"}
                  {selectedSubtitle.animationStyle === "word-by-word" &&
                    "Shows one word at a time"}
                  {selectedSubtitle.animationStyle === "bounce" &&
                    "Words bounce in as they appear"}
                  {selectedSubtitle.animationStyle === "typewriter" &&
                    "Words appear progressively like typing"}
                  {(!selectedSubtitle.animationStyle ||
                    selectedSubtitle.animationStyle === "none") &&
                    "Static text, no animation"}
                </Text>
                {selectedSubtitle.animationStyle &&
                  selectedSubtitle.animationStyle !== "none" &&
                  !selectedSubtitle.words?.length && (
                    <Card variant="muted" padding={2} className="bg-amber-400/10">
                      <Text type="supporting" display="block" className="text-[9px] text-amber-400">
                      No word-level timing data. Re-generate captions to
                      enable animation.
                      </Text>
                    </Card>
                  )}
                {selectedSubtitle.animationStyle &&
                  selectedSubtitle.animationStyle !== "none" &&
                  selectedSubtitle.animationStyle !== "typewriter" &&
                  selectedSubtitle.animationStyle !== "word-by-word" && (
                    <div className="pt-2 border-t border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <Text type="supporting" color="secondary" className="text-[10px]">
                          Highlight Color
                        </Text>
                        <div className="flex items-center gap-2">
                          <ColorSelector
                            value={
                              selectedSubtitle.style?.highlightColor ||
                              "#ffff00"
                            }
                            label="Select highlight color"
                            onChange={(highlightColor) =>
                              updateSubtitle(selectedSubtitle.id, {
                                style: {
                                  ...(selectedSubtitle.style || {}),
                                  highlightColor,
                                } as typeof selectedSubtitle.style,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {[
                          "#ffff00",
                          "#00ff00",
                          "#ff6b6b",
                          "#4ecdc4",
                          "#ff9f43",
                          "#a55eea",
                        ].map((color) => (
                          <Button
                            key={color}
                            label={color}
                            onClick={() =>
                              updateSubtitle(selectedSubtitle.id, {
                                style: {
                                  ...(selectedSubtitle.style || {}),
                                  highlightColor: color,
                                } as typeof selectedSubtitle.style,
                              })
                            }
                            variant="ghost"
                            size="sm"
                            className={`h-6 w-6 rounded border-2 p-0 transition-transform hover:scale-110 ${
                              (selectedSubtitle.style?.highlightColor ||
                                "#ffff00") === color
                                ? "border-white"
                                : "border-transparent"
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </Section>

  );
};
