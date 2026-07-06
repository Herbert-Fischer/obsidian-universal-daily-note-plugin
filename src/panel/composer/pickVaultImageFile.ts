import { FuzzySuggestModal, type App, TFile } from "obsidian";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "avif"]);

function isImageFile(file: TFile): boolean {
  return IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
}

/** Pick an existing vault image (e.g. from +/) for composer photo lists. */
export function pickVaultImageFile(app: App): Promise<string | null> {
  return new Promise((resolve) => {
    class VaultImagePicker extends FuzzySuggestModal<TFile> {
      getItems(): TFile[] {
        return app.vault.getFiles().filter(isImageFile);
      }

      getItemText(item: TFile): string {
        return item.path;
      }

      onChooseItem(item: TFile): void {
        resolve(item.path);
      }

      onClose(): void {
        resolve(null);
      }
    }

    new VaultImagePicker(app).open();
  });
}
