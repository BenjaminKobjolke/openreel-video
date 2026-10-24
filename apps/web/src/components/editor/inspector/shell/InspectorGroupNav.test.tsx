import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { useInspectorNavigationStore } from "../../../../stores/inspector-navigation-store";
import { InspectorGroupNav } from "./InspectorGroupNav";

describe("InspectorGroupNav", () => {
  afterEach(() => {
    cleanup();
    useInspectorNavigationStore.getState().clearRequest();
  });

  it("requests the first section in a group and selects its tab", () => {
    const containerRef = React.createRef<HTMLDivElement>();
    render(
      <>
        <div ref={containerRef}>
          <div data-inspector-group="animate">
            <section data-section-id="keyframes" />
          </div>
        </div>
        <InspectorGroupNav
          tabIds={["transform", "animate"]}
          clipId="c1"
          containerRef={containerRef}
        />
      </>,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Animate/ }));

    expect(useInspectorNavigationStore.getState().request).toMatchObject({
      sectionId: "keyframes",
      clipId: "c1",
    });
    expect(screen.getByRole("tab", { name: /Animate/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("does not request navigation when the selected group has no section", () => {
    const containerRef = React.createRef<HTMLDivElement>();
    render(
      <>
        <div ref={containerRef}>
          <div data-inspector-group="transform">
            <section data-section-id="transform" />
          </div>
        </div>
        <InspectorGroupNav
          tabIds={["transform", "animate"]}
          clipId="c1"
          containerRef={containerRef}
        />
      </>,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Animate/ }));

    expect(useInspectorNavigationStore.getState().request).toBeNull();
  });
});
