import { useCallback, useEffect, useState } from "react";
import type { EditingTemplatePrimitive } from "@openreel/core";
import { toast } from "../../../stores/notification-store";
import { useProjectStore } from "../../../stores/project-store";
import { useInspectorNavigationStore } from "../../../stores/inspector-navigation-store";
import { mergeEditingTemplateControlValues } from "../panels/EditingTemplateControls";

export function useRecipeControls(
  projectId: string,
  selectedClipIds: string[],
  selectedTimelineClip: { id: string } | null,
) {
  const getEditingTemplate = useProjectStore((state) => state.getEditingTemplate);
  const updateEditingTemplateApplication = useProjectStore((state) => state.updateEditingTemplateApplication);
  const [expandedRecipeApplicationId, setExpandedRecipeApplicationId] = useState<string | null>(null);
  const [recipeControlValues, setRecipeControlValues] = useState<
    Record<string, Record<string, EditingTemplatePrimitive>>
  >({});

  useEffect(() => {
    setExpandedRecipeApplicationId(null);
    useInspectorNavigationStore.getState().clearRequest();
  }, [selectedClipIds, projectId]);

  const handleRecipeControlChange = useCallback(
    (applicationId: string, controlId: string, value: EditingTemplatePrimitive) => {
      setRecipeControlValues((current) => ({
        ...current,
        [applicationId]: {
          ...(current[applicationId] || {}),
          [controlId]: value,
        },
      }));
    },
    [],
  );

  const handleToggleRecipeControls = useCallback(
    (applicationId: string, templateId: string, controlValues?: Record<string, unknown>) => {
      const template = getEditingTemplate(templateId);
      if (!template || !template.controls || template.controls.length === 0) return;

      setExpandedRecipeApplicationId((current) => current === applicationId ? null : applicationId);
      setRecipeControlValues((current) => current[applicationId]
        ? current
        : {
            ...current,
            [applicationId]: mergeEditingTemplateControlValues(template, controlValues),
          });
    },
    [getEditingTemplate],
  );

  const handleResetRecipeControls = useCallback(
    (applicationId: string, templateId: string, controlValues?: Record<string, unknown>) => {
      const template = getEditingTemplate(templateId);
      if (!template) return;
      setRecipeControlValues((current) => ({
        ...current,
        [applicationId]: mergeEditingTemplateControlValues(template, controlValues),
      }));
    },
    [getEditingTemplate],
  );

  const handleUpdateRecipeControls = useCallback(
    (applicationId: string, templateId: string, controlValues?: Record<string, unknown>) => {
      if (!selectedTimelineClip) return;
      const template = getEditingTemplate(templateId);
      if (!template) {
        toast.error("Recipe unavailable", "This recipe definition is no longer available.");
        return;
      }
      const nextControlValues = recipeControlValues[applicationId] ||
        mergeEditingTemplateControlValues(template, controlValues);
      const updated = updateEditingTemplateApplication(selectedTimelineClip.id, applicationId, nextControlValues);
      if (!updated) {
        toast.error("Could not update recipe", "The recipe controls could not be saved for this clip.");
        return;
      }
      toast.success("Recipe updated", `${template.name} was updated on this clip.`);
    },
    [getEditingTemplate, recipeControlValues, selectedTimelineClip, updateEditingTemplateApplication],
  );

  return {
    expandedRecipeApplicationId,
    setExpandedRecipeApplicationId,
    recipeControlValues,
    setRecipeControlValues,
    handleRecipeControlChange,
    handleToggleRecipeControls,
    handleResetRecipeControls,
    handleUpdateRecipeControls,
  };
}
