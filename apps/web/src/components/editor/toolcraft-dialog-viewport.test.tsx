import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ToolcraftDialog,
  ToolcraftDialogHeader,
  ToolcraftLayout,
  ToolcraftLayoutContent,
} from "@openreel/ui";

describe("Toolcraft dialog viewport sizing", () => {
  it("keeps the dialog and its close control inside the visible viewport", () => {
    render(
      <ToolcraftDialog isOpen width={896}>
        <ToolcraftLayout
          header={<ToolcraftDialogHeader title="T" onOpenChange={() => {}} />}
          content={<ToolcraftLayoutContent>x</ToolcraftLayoutContent>}
        />
      </ToolcraftDialog>,
    );

    const dialog = screen.getByRole("dialog");
    const dialogClasses = dialog.className.split(/\s+/);
    const layout = dialog.firstElementChild;

    expect(dialogClasses).toContain("grid-cols-[minmax(0,1fr)]");
    expect(dialogClasses).toContain("max-h-[calc(100dvh_-_32px)]");
    expect(dialogClasses).toContain("overflow-y-auto");
    expect(dialogClasses).not.toContain("overflow-hidden");
    expect(layout?.className).toContain("max-h-[90dvh]");
    expect(layout?.className).not.toContain("max-h-[90vh]");
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeInTheDocument();
  });
});
