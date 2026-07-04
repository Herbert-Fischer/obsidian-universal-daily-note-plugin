import type { App } from "obsidian";

export type PhotoAspect = "landscape" | "portrait" | "square";

const LANDSCAPE_RATIO = 1.15;
const PORTRAIT_RATIO = 0.87;

export function classifyAspect(width: number, height: number): PhotoAspect {
  if (width <= 0 || height <= 0) return "square";
  const ratio = width / height;
  if (ratio >= LANDSCAPE_RATIO) return "landscape";
  if (ratio <= PORTRAIT_RATIO) return "portrait";
  return "square";
}

async function decodeImageDimensions(data: ArrayBuffer): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(new Blob([data]));
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      /* fall through */
    }
  }

  return new Promise((resolve) => {
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** Read image dimensions from vault and classify aspect ratio. */
export async function loadPhotoAspect(app: App, vaultPath: string): Promise<PhotoAspect> {
  const trimmed = vaultPath.replace(/^!\[\[|\]\]$/g, "").trim();
  if (!trimmed) return "square";
  try {
    const data = await app.vault.adapter.readBinary(trimmed);
    const dims = await decodeImageDimensions(data);
    if (!dims) return "square";
    return classifyAspect(dims.width, dims.height);
  } catch {
    return "square";
  }
}

export async function loadPhotoAspects(app: App, paths: string[]): Promise<PhotoAspect[]> {
  return Promise.all(paths.map((path) => loadPhotoAspect(app, path)));
}
