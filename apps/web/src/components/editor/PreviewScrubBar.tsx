import { useRef, useState } from "react";

type PreviewScrubBarProps = {
  position: number;
  duration: number;
  onScrubStart: () => void;
  onScrub: (time: number) => void;
  onScrubEnd: () => void;
};

export function PreviewScrubBar({
  position,
  duration,
  onScrubStart,
  onScrub,
  onScrubEnd,
}: PreviewScrubBarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const activePointerId = useRef<number | null>(null);
  const fillPercentage = duration > 0 ? Math.max(0, Math.min(100, (position / duration) * 100)) : 0;

  const scrubAtPointer = (clientX: number, target: HTMLDivElement) => {
    const rect = target.getBoundingClientRect();
    const percentage = rect.width > 0
      ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      : 0;
    onScrub(percentage * (duration || 10));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    activePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsDragging(true);
    onScrubStart();
    scrubAtPointer(event.clientX, event.currentTarget);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== event.pointerId) return;
    scrubAtPointer(event.clientX, event.currentTarget);
  };

  const finishScrubbing = (event: React.PointerEvent<HTMLDivElement>, seekFinalPosition: boolean) => {
    if (activePointerId.current !== event.pointerId) return;
    if (seekFinalPosition) scrubAtPointer(event.clientX, event.currentTarget);
    activePointerId.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onScrubEnd();
  };

  return (
    <div
      data-preview-scrub
      className={`h-1.5 bg-bg-2 cursor-pointer group hover:h-2.5 transition-all relative touch-none${isDragging ? " cursor-grabbing" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishScrubbing(event, true)}
      onPointerCancel={(event) => finishScrubbing(event, false)}
    >
      <div
        data-preview-scrub-fill
        className="h-full bg-accent relative pointer-events-none shadow-glow"
        style={{ width: `${fillPercentage}%` }}
      >
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity transform scale-0 group-hover:scale-100 duration-100 border border-black/20" />
      </div>
    </div>
  );
}
