const LIGHTBOX_CLASS = "udn-photoLightbox";

let overlay: HTMLElement | null = null;
let urls: string[] = [];
let index = 0;
let keyHandler: ((ev: KeyboardEvent) => void) | null = null;

function renderImage(): void {
  if (!overlay) return;
  const img = overlay.querySelector<HTMLImageElement>(".udn-photoLightboxImage");
  const counter = overlay.querySelector<HTMLElement>(".udn-photoLightboxCounter");
  if (img) {
    img.src = urls[index] ?? "";
    img.alt = "";
  }
  if (counter) {
    counter.textContent = urls.length > 1 ? `${index + 1} / ${urls.length}` : "";
  }
  const prev = overlay.querySelector<HTMLButtonElement>(".udn-photoLightboxPrev");
  const next = overlay.querySelector<HTMLButtonElement>(".udn-photoLightboxNext");
  if (prev) prev.disabled = index <= 0;
  if (next) next.disabled = index >= urls.length - 1;
}

function step(delta: number): void {
  if (urls.length === 0) return;
  index = Math.max(0, Math.min(urls.length - 1, index + delta));
  renderImage();
}

export function closePhotoLightbox(): void {
  if (keyHandler) {
    document.removeEventListener("keydown", keyHandler);
    keyHandler = null;
  }
  overlay?.remove();
  overlay = null;
  urls = [];
  index = 0;
}

export function openPhotoLightbox(imageUrls: string[], startIndex = 0): void {
  const list = imageUrls.filter(Boolean);
  if (list.length === 0) return;

  closePhotoLightbox();
  urls = list;
  index = Math.max(0, Math.min(list.length - 1, startIndex));

  overlay = document.createElement("div");
  overlay.className = LIGHTBOX_CLASS;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <button type="button" class="udn-photoLightboxBackdrop" aria-label="Schließen"></button>
    <div class="udn-photoLightboxStage">
      <button type="button" class="udn-photoLightboxNav udn-photoLightboxPrev" aria-label="Vorheriges Bild">‹</button>
      <img class="udn-photoLightboxImage" alt="" />
      <button type="button" class="udn-photoLightboxNav udn-photoLightboxNext" aria-label="Nächstes Bild">›</button>
    </div>
    <button type="button" class="udn-photoLightboxClose" aria-label="Schließen">×</button>
    <span class="udn-photoLightboxCounter"></span>
  `;

  overlay.querySelector(".udn-photoLightboxBackdrop")?.addEventListener("click", closePhotoLightbox);
  overlay.querySelector(".udn-photoLightboxClose")?.addEventListener("click", closePhotoLightbox);
  overlay.querySelector(".udn-photoLightboxPrev")?.addEventListener("click", () => step(-1));
  overlay.querySelector(".udn-photoLightboxNext")?.addEventListener("click", () => step(1));

  keyHandler = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") closePhotoLightbox();
    else if (ev.key === "ArrowLeft") step(-1);
    else if (ev.key === "ArrowRight") step(1);
  };
  document.addEventListener("keydown", keyHandler);

  document.body.appendChild(overlay);
  renderImage();
}

export function galleryImageUrlsFromTarget(target: EventTarget | null): { urls: string[]; index: number } | null {
  if (!(target instanceof HTMLElement)) return null;
  const img = target.closest<HTMLImageElement>("div[data-callout-metadata*='gallery'] img");
  if (!img?.src) return null;

  const row = img.closest(".callout-content p, .udn-photoStrip");
  if (!row) return { urls: [img.src], index: 0 };

  const images = [...row.querySelectorAll<HTMLImageElement>("img")].filter((el) => el.src);
  const idx = images.indexOf(img);
  return { urls: images.map((el) => el.src), index: idx >= 0 ? idx : 0 };
}

export function registerPhotoGalleryLightbox(plugin: { registerDomEvent: (el: HTMLElement, event: "click", cb: (ev: MouseEvent) => void) => void }): void {
  plugin.registerDomEvent(document, "click", (ev) => {
    const match = galleryImageUrlsFromTarget(ev.target);
    if (!match) return;
    ev.preventDefault();
    ev.stopPropagation();
    openPhotoLightbox(match.urls, match.index);
  });
}
