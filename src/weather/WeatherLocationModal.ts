import { App, Modal, Setting } from "obsidian";
import { formatGermanShortDate } from "../notes/journalCallout";

export type WeatherLocationPromptOptions = {
  date: Date;
  defaultLocation?: string;
  requireInput?: boolean;
};

export function promptWeatherLocation(
  app: App,
  options: WeatherLocationPromptOptions,
): Promise<string | null> {
  return new Promise((resolve) => {
    new WeatherLocationModal(app, options, resolve).open();
  });
}

class WeatherLocationModal extends Modal {
  private query = "";
  private resolved = false;

  constructor(
    app: App,
    private options: WeatherLocationPromptOptions,
    private onDone: (value: string | null) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.query = this.options.defaultLocation ?? "";

    const dateLabel = formatGermanShortDate(this.options.date);
    this.setTitle(this.options.requireInput ? `Wetter · ${dateLabel}` : "Standort für Wetter");

    contentEl.createEl("p", {
      cls: "udn-weatherModalHint",
      text: this.options.requireInput
        ? "Für vergangene Tage: Ort eingeben (z. B. „Erbach“ oder „Berlin“)."
        : "GPS nicht verfügbar — bitte Ort eingeben.",
    });

    new Setting(contentEl)
      .setName("Ort")
      .addText((t) => {
        t.setPlaceholder("Stadt oder Ort")
          .setValue(this.query)
          .onChange((v) => {
            this.query = v;
          });
        t.inputEl.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            this.submit();
          }
        });
        window.setTimeout(() => t.inputEl.focus(), 50);
      });

    new Setting(contentEl).addButton((btn) => {
      btn.setButtonText("Wetter einfügen").setCta().onClick(() => this.submit());
    });
  }

  private submit(): void {
    const q = this.query.trim();
    if (!q && this.options.requireInput) return;
    if (!q) {
      this.closeWith(null);
      return;
    }
    this.closeWith(q);
  }

  onClose(): void {
    if (!this.resolved) this.onDone(null);
    this.contentEl.empty();
  }

  private closeWith(value: string | null): void {
    this.resolved = true;
    this.onDone(value);
    this.close();
  }
}
