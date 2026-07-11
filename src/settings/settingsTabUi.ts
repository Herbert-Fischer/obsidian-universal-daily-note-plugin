import { Setting } from "obsidian";
import type { WandernLayoutSettings } from "../settings";

export type SaveSettings = () => Promise<void>;

export function renderSettingsIntro(container: HTMLElement): void {
  container.createEl("p", {
    cls: "setting-item-description udn-settings-intro",
    text: "Tagebuch-Outline, Composer und Integrationen für Daily Notes. Abschnitte aufklappen für Details.",
  });
}

export function renderSettingsSection(
  container: HTMLElement,
  title: string,
  render: (body: HTMLElement) => void,
  options?: { description?: string; collapsed?: boolean },
): void {
  const details = container.createEl("details", { cls: "udn-settings-section" });
  if (!options?.collapsed) details.open = true;
  details.createEl("summary", { cls: "udn-settings-section-title", text: title });
  if (options?.description) {
    details.createEl("p", {
      cls: "setting-item-description udn-settings-section-desc",
      text: options.description,
    });
  }
  const body = details.createDiv({ cls: "udn-settings-section-body" });
  render(body);
}

export function renderSettingsSubheading(body: HTMLElement, title: string, description?: string): void {
  body.createEl("h4", { cls: "udn-settings-subheading", text: title });
  if (description) {
    body.createEl("p", { cls: "setting-item-description", text: description });
  }
}

export function renderWalkLayoutSettings(
  body: HTMLElement,
  layout: WandernLayoutSettings,
  options: {
    title: string;
    description: string;
    defaultTemplate: string;
    save: SaveSettings;
  },
): void {
  if (!layout.template.trim()) {
    layout.template = options.defaultTemplate;
  }

  renderSettingsSubheading(body, options.title, options.description);

  new Setting(body)
    .setName("Fotos-Ordner")
    .setDesc("Basisordner; Unterordner = Callout-Titel.")
    .addText((t) =>
      t.setValue(layout.photosFolder ?? "").onChange(async (value) => {
        layout.photosFolder = value.trim() || layout.photosFolder;
        await options.save();
      }),
    );

  new Setting(body)
    .setName("GPX-Ordner")
    .setDesc("Suchen, Speichern und Reisen-Vorlagen; Dateiname enthält YYYY-MM-DD.")
    .addText((t) =>
      t.setValue(layout.tracksFolder ?? "").onChange(async (value) => {
        layout.tracksFolder = value.trim() || layout.tracksFolder;
        await options.save();
      }),
    );

  new Setting(body)
    .setName("Markdown-Vorlage")
    .setDesc("Platzhalter: {{titel}}, {{kurz}}, {{beschreibung}}, {{track3d}}, {{fotos}}, {{datum}} …")
    .addTextArea((t) => {
      t.inputEl.rows = 10;
      t.setValue(layout.template).onChange(async (value) => {
        layout.template = value;
        await options.save();
      });
    });

  new Setting(body)
    .setName("Max. Fotos")
    .addText((t) =>
      t.setValue(String(layout.maxPhotos ?? 3)).onChange(async (value) => {
        layout.maxPhotos = Math.max(1, Number.parseInt(value, 10) || 3);
        await options.save();
      }),
    );

  new Setting(body)
    .setName("3D-Track ({{track3d}})")
    .addToggle((t) =>
      t.setValue(layout.track3dEnabled ?? true).onChange(async (value) => {
        layout.track3dEnabled = value;
        await options.save();
      }),
    );

  new Setting(body)
    .setName("3D-Höhe (px)")
    .addText((t) =>
      t.setValue(String(layout.track3dHeight ?? 400)).onChange(async (value) => {
        layout.track3dHeight = Math.max(120, Number.parseInt(value, 10) || 400);
        await options.save();
      }),
    );

  new Setting(body)
    .setName("3D-Höhen-Überhöhung")
    .addText((t) =>
      t.setValue(String(layout.track3dElevationExaggeration ?? 4)).onChange(async (value) => {
        layout.track3dElevationExaggeration = Math.max(1, Number.parseFloat(value) || 4);
        await options.save();
      }),
    );
}
