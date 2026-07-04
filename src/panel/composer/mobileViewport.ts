const MIN_ASSUMED_KEYBOARD_RATIO = 0.36;
const KEYBOARD_INSET_THRESHOLD = 140;

/** Fallback when visualViewport lags behind the keyboard animation (common on Android WebViews). */
export function estimateKeyboardInset(): number {
  return readKeyboardInset();
}

export function readKeyboardInset(options?: { assumeOpen?: boolean }): number {
  const vv = window.visualViewport;
  let inset = 0;
  if (vv) {
    inset = Math.max(0, window.innerHeight - vv.offsetTop - vv.height);
  }
  if (options?.assumeOpen && inset < KEYBOARD_INSET_THRESHOLD) {
    inset = Math.max(inset, Math.round(window.innerHeight * MIN_ASSUMED_KEYBOARD_RATIO));
  }
  return inset;
}

function applyViewportVars(
  rootEl: HTMLElement,
  inset: number,
  vv: VisualViewport | null,
): void {
  rootEl.style.setProperty("--udn-vv-keyboard-inset", `${Math.max(0, inset)}px`);
  if (vv) {
    rootEl.style.setProperty("--udn-vv-height", `${vv.height}px`);
    rootEl.style.setProperty("--udn-vv-offset-top", `${vv.offsetTop}px`);
  }
}

/** Keeps modal/content aligned with the visible viewport when the on-screen keyboard opens (mobile). */
export function attachMobileViewport(...rootEls: HTMLElement[]): () => void {
  const roots = rootEls.filter(Boolean);
  const vv = window.visualViewport;
  if (!vv || roots.length === 0) return () => {};

  const apply = (): void => {
    const inset = readKeyboardInset();
    for (const rootEl of roots) {
      applyViewportVars(rootEl, inset, vv);
    }
  };

  apply();
  vv.addEventListener("resize", apply);
  vv.addEventListener("scroll", apply);
  window.addEventListener("resize", apply);

  return () => {
    vv.removeEventListener("resize", apply);
    vv.removeEventListener("scroll", apply);
    window.removeEventListener("resize", apply);
    for (const rootEl of roots) {
      rootEl.style.removeProperty("--udn-vv-height");
      rootEl.style.removeProperty("--udn-vv-offset-top");
      rootEl.style.removeProperty("--udn-vv-keyboard-inset");
    }
  };
}

export function applyKeyboardInset(rootEl: HTMLElement, inset: number): void {
  rootEl.style.setProperty("--udn-vv-keyboard-inset", `${Math.max(0, inset)}px`);
}

function dockHeight(rootEl?: HTMLElement): number {
  if (!rootEl) return 0;
  return parseFloat(getComputedStyle(rootEl).getPropertyValue("--udn-composer-dock-height") || "0");
}

function scrollParentFor(el: HTMLElement, rootEl?: HTMLElement): HTMLElement | null {
  if (el.closest(".udn-composerMobileDock, .udn-composerMobileFoot")) return null;
  const section = el.closest(".udn-composerSection");
  if (section instanceof HTMLElement) return section;
  return rootEl?.querySelector(".udn-composerSection") ?? null;
}

function visibleBounds(rootEl: HTMLElement | undefined, assumeKeyboardOpen: boolean): {
  top: number;
  bottom: number;
} {
  const vv = window.visualViewport;
  const padding = 8;
  const dock = dockHeight(rootEl);
  const inset = readKeyboardInset({ assumeOpen: assumeKeyboardOpen });
  if (vv) {
    const layoutBottom = vv.offsetTop + vv.height;
    const keyboardTop = window.innerHeight - inset;
    const visibleBottom = Math.min(layoutBottom, keyboardTop) - dock - padding;
    return { top: vv.offsetTop + padding, bottom: visibleBottom };
  }
  const visibleBottom = window.innerHeight - inset - dock - padding;
  return { top: padding, bottom: visibleBottom };
}

export function scrollInputIntoView(el: HTMLElement, rootEl?: HTMLElement): void {
  const assumeOpen = true;
  const run = (): void => {
    if (rootEl) {
      const inset = readKeyboardInset({ assumeOpen });
      applyKeyboardInset(rootEl, inset);
    }

    const { top: visibleTop, bottom: visibleBottom } = visibleBounds(rootEl, assumeOpen);
    const rect = el.getBoundingClientRect();
    if (rect.top >= visibleTop && rect.bottom <= visibleBottom) return;

    const scrollParent = scrollParentFor(el, rootEl);
    if (scrollParent) {
      if (rect.bottom > visibleBottom) {
        scrollParent.scrollTop += Math.ceil(rect.bottom - visibleBottom);
      } else if (rect.top < visibleTop) {
        scrollParent.scrollTop -= Math.ceil(visibleTop - rect.top);
      }
      return;
    }

    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  requestAnimationFrame(run);
  window.setTimeout(run, 120);
  window.setTimeout(run, 320);
  window.setTimeout(run, 520);
}

export function observeDockHeight(dockEl: HTMLElement, rootEl: HTMLElement): () => void {
  const apply = (): void => {
    rootEl.style.setProperty("--udn-composer-dock-height", `${dockEl.offsetHeight}px`);
  };
  apply();
  const ro = new ResizeObserver(apply);
  ro.observe(dockEl);
  return () => {
    ro.disconnect();
    rootEl.style.removeProperty("--udn-composer-dock-height");
  };
}

/** Sync keyboard inset while inputs inside the composer are focused (Obsidian mobile often skips visualViewport). */
export function attachComposerMobileKeyboard(
  composerRoot: HTMLElement,
  ...viewportRoots: HTMLElement[]
): () => void {
  const roots = [composerRoot, ...viewportRoots.filter(Boolean)];
  const vv = window.visualViewport;
  let syncTimer: number | null = null;

  const sync = (assumeOpen: boolean): void => {
    const inset = readKeyboardInset({ assumeOpen });
    for (const root of roots) {
      applyViewportVars(root, inset, vv);
    }
  };

  const onFocusIn = (ev: FocusEvent): void => {
    const target = ev.target;
    if (!(target instanceof HTMLElement) || !composerRoot.contains(target)) return;
    sync(true);
    if (syncTimer) window.clearInterval(syncTimer);
    syncTimer = window.setInterval(() => sync(true), 120);
    scrollInputIntoView(target, composerRoot);
  };

  const onFocusOut = (): void => {
    window.setTimeout(() => {
      if (composerRoot.contains(document.activeElement)) return;
      if (syncTimer) {
        window.clearInterval(syncTimer);
        syncTimer = null;
      }
      sync(false);
    }, 100);
  };

  composerRoot.addEventListener("focusin", onFocusIn);
  composerRoot.addEventListener("focusout", onFocusOut);

  return () => {
    composerRoot.removeEventListener("focusin", onFocusIn);
    composerRoot.removeEventListener("focusout", onFocusOut);
    if (syncTimer) window.clearInterval(syncTimer);
  };
}
