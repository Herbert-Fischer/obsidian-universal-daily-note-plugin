import type { ComposerWindowSettings } from "../../settings";

export function applyComposerWindowPosition(
  modalEl: HTMLElement,
  position: ComposerWindowSettings,
): void {
  if (position.x == null || position.y == null) return;
  modalEl.style.position = "fixed";
  modalEl.style.margin = "0";
  modalEl.style.left = `${position.x}px`;
  modalEl.style.top = `${position.y}px`;
  modalEl.style.transform = "none";
}

export function clampComposerPosition(
  x: number,
  y: number,
  modalEl: HTMLElement,
): { x: number; y: number } {
  const rect = modalEl.getBoundingClientRect();
  const maxX = Math.max(0, window.innerWidth - Math.max(rect.width, 320));
  const maxY = Math.max(0, window.innerHeight - Math.max(rect.height, 200));
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  };
}

export function attachComposerDrag(
  modalEl: HTMLElement,
  dragHandle: HTMLElement,
  initial: ComposerWindowSettings,
  onPositionChange: (pos: { x: number; y: number }) => void,
): () => void {
  applyComposerWindowPosition(modalEl, initial);
  modalEl.classList.add("udn-composerModal--draggable");

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const target = ev.target as HTMLElement;
    if (target.closest("button, input, textarea, select, a, .udn-composerHeadCompactNav")) return;

    dragging = true;
    dragHandle.setPointerCapture(ev.pointerId);
    const rect = modalEl.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
    startX = ev.clientX;
    startY = ev.clientY;
    modalEl.style.position = "fixed";
    modalEl.style.margin = "0";
    modalEl.style.transform = "none";
    modalEl.style.left = `${originLeft}px`;
    modalEl.style.top = `${originTop}px`;
    ev.preventDefault();
  };

  const onPointerMove = (ev: PointerEvent) => {
    if (!dragging) return;
    const next = clampComposerPosition(
      originLeft + (ev.clientX - startX),
      originTop + (ev.clientY - startY),
      modalEl,
    );
    modalEl.style.left = `${next.x}px`;
    modalEl.style.top = `${next.y}px`;
  };

  const onPointerUp = (ev: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    dragHandle.releasePointerCapture(ev.pointerId);
    const rect = modalEl.getBoundingClientRect();
    onPositionChange({ x: Math.round(rect.left), y: Math.round(rect.top) });
  };

  dragHandle.addEventListener("pointerdown", onPointerDown);
  dragHandle.addEventListener("pointermove", onPointerMove);
  dragHandle.addEventListener("pointerup", onPointerUp);
  dragHandle.addEventListener("pointercancel", onPointerUp);

  return () => {
    dragHandle.removeEventListener("pointerdown", onPointerDown);
    dragHandle.removeEventListener("pointermove", onPointerMove);
    dragHandle.removeEventListener("pointerup", onPointerUp);
    dragHandle.removeEventListener("pointercancel", onPointerUp);
    modalEl.classList.remove("udn-composerModal--draggable");
  };
}
