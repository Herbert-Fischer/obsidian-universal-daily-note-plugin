import { Platform } from "obsidian";
import { sidebarPointerAction } from "@denkarium/obsidian-lib-ui";

/** Sidebar controls on mobile: normal click/tap. Desktop: pointerdown (leaf focus steal). */
export function panelTapAction(
  node: HTMLElement,
  action: (() => void) | ((ev: PointerEvent) => void),
): ReturnType<typeof sidebarPointerAction> {
  if (!Platform.isMobile) {
    return sidebarPointerAction(node, action);
  }

  const run = () => {
    if (action.length === 0) (action as () => void)();
    else (action as (ev: PointerEvent) => void)({} as PointerEvent);
  };

  const onPointerUp = (evt: PointerEvent) => {
    if (evt.button !== 0) return;
    evt.stopPropagation();
    run();
  };

  node.addEventListener("pointerup", onPointerUp);

  return {
    update(next: (() => void) | ((ev: PointerEvent) => void)) {
      action = next;
    },
    destroy() {
      node.removeEventListener("pointerup", onPointerUp);
    },
  };
}
