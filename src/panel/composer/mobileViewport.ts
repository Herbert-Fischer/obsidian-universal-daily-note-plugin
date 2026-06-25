/** Keeps modal/content aligned with the visible viewport when the on-screen keyboard opens (mobile). */
export function attachMobileViewport(...rootEls: HTMLElement[]): () => void {
  const roots = rootEls.filter(Boolean);
  const vv = window.visualViewport;
  if (!vv || roots.length === 0) return () => {};

  const apply = (): void => {
    const height = vv.height;
    const offsetTop = vv.offsetTop;
    const keyboardInset = Math.max(0, window.innerHeight - offsetTop - height);
    for (const rootEl of roots) {
      rootEl.style.setProperty("--udn-vv-height", `${height}px`);
      rootEl.style.setProperty("--udn-vv-offset-top", `${offsetTop}px`);
      rootEl.style.setProperty("--udn-vv-keyboard-inset", `${keyboardInset}px`);
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

/** Fallback when visualViewport lags behind the keyboard animation (common on Android WebViews). */
export function estimateKeyboardInset(): number {
  const vv = window.visualViewport;
  if (vv) {
    return Math.max(0, window.innerHeight - vv.offsetTop - vv.height);
  }
  return Math.round(window.innerHeight * 0.38);
}

export function applyKeyboardInset(rootEl: HTMLElement, inset: number): void {
  rootEl.style.setProperty("--udn-vv-keyboard-inset", `${Math.max(0, inset)}px`);
}

export function scrollInputIntoView(el: HTMLElement, rootEl?: HTMLElement): void {
  const run = (): void => {
    const vv = window.visualViewport;
    if (!vv) {
      el.scrollIntoView({ block: "center", inline: "nearest" });
      return;
    }
    const rect = el.getBoundingClientRect();
    const visibleBottom = vv.offsetTop + vv.height - 6;
    if (rect.bottom <= visibleBottom) return;
    if (rootEl) {
      const extra = Math.ceil(rect.bottom - visibleBottom);
      const current = parseFloat(getComputedStyle(rootEl).getPropertyValue("--udn-vv-keyboard-inset") || "0");
      applyKeyboardInset(rootEl, current + extra);
      return;
    }
    el.scrollIntoView({ block: "end", inline: "nearest" });
  };

  requestAnimationFrame(run);
  window.setTimeout(run, 120);
  window.setTimeout(run, 320);
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
