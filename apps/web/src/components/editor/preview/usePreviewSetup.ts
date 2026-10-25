import { usePreviewSetup1 } from "./usePreviewSetup1";
import { usePreviewSetup2 } from "./usePreviewSetup2";
import { usePreviewSetup3 } from "./usePreviewSetup3";
import { usePreviewSetup4 } from "./usePreviewSetup4";

export function usePreviewSetup() {
  const setup1 = usePreviewSetup1();
  const setup2 = usePreviewSetup2(setup1);
  const setup3 = usePreviewSetup3(setup2);
  return usePreviewSetup4(setup3);
}
