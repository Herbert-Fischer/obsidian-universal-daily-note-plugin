import { App, PluginSettingTab, Setting } from "obsidian";
import type UniversalDailyNotePlugin from "./main";

export class UniversalDailyNoteSettingTab extends PluginSettingTab {
  plugin: UniversalDailyNotePlugin;

  constructor(app: App, plugin: UniversalDailyNotePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Universal Daily Note" });

    new Setting(containerEl)
      .setName("Outline beim Start öffnen")
      .setDesc("Tagebuch-Outline rechts unten öffnen, wenn das Plugin aktiviert wird.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.openPanelOnEnable).onChange(async (value) => {
          this.plugin.settings.openPanelOnEnable = value;
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("h3", { text: "Tagebuch-Outline" });

    const ol = this.plugin.settings.outline;

    new Setting(containerEl)
      .setName("Zeitraum (Tage)")
      .setDesc("Anzahl Tage rückwärts ab Kalenderdatum (wie Daily Note Outline).")
      .addText((t) =>
        t
          .setValue(String(ol.durationDays))
          .onChange(async (value) => {
            const n = Math.max(1, parseInt(value, 10) || 365);
            ol.durationDays = n;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Standard-Abschnitt")
      .setDesc("Start-Abschnitt (Standard: Tagebuch). Aufgaben/Tasks erscheinen nicht in der Auswahl.")
      .addText((t) =>
        t.setValue(ol.journalHeading).onChange(async (value) => {
          ol.journalHeading = value.trim() || "Tagebuch";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Zeitraum-Modus")
      .setDesc("Monat/Woche folgen dem Universal Calendar; Alle = ohne Datumsfilter (scrollen).")
      .addDropdown((d) =>
        d
          .addOptions({
            scroll: "Alle",
            month: "Monat (Kalender)",
            week: "Woche (Kalender)",
          })
          .setValue(ol.rangeMode ?? "scroll")
          .onChange(async (value) => {
            ol.rangeMode = (value as typeof ol.rangeMode) || "scroll";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Tage pro Seite")
      .setDesc("Nur im Modus „Alle“: Tagebuch-Tage pro Ladung; beim Scrollen weitere.")
      .addText((t) =>
        t
          .setValue(String(ol.pageSize ?? 10))
          .onChange(async (value) => {
            ol.pageSize = Math.max(1, parseInt(value, 10) || 10);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Zeit-Bubbles anzeigen")
      .setDesc("Uhrzeit vor Tagebuch-Einträgen in der Outline (auch per Toolbar-Uhr umschaltbar).")
      .addToggle((t) =>
        t.setValue(ol.showTimeBubbles ?? true).onChange(async (value) => {
          ol.showTimeBubbles = value;
          await this.plugin.saveSettings();
        }),
      );

    const wx = this.plugin.settings.weatherCapture;

    containerEl.createEl("h3", { text: "Wetter & Ort" });

    new Setting(containerEl)
      .setName("Frontmatter Location")
      .setDesc("Ort in Frontmatter Location: schreiben.")
      .addToggle((t) =>
        t.setValue(wx.updateFrontmatter).onChange(async (value) => {
          wx.updateFrontmatter = value;
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Wetter erscheint nur in der Callout-Überschrift (tagebuch-ref) und in der Outline — kein Tagebuch-Eintrag, kein Frontmatter.",
    });

    const cal = this.plugin.settings.calendarSync;

    containerEl.createEl("h3", { text: "Kalender-Termine" });

    new Setting(containerEl)
      .setName("Termine automatisch übernehmen")
      .setDesc("Universal Calendar: Termine als „Termin:“-Zeilen ins Tagebuch (Composer, Speichern, Outline).")
      .addToggle((t) =>
        t.setValue(cal.enabled).onChange(async (value) => {
          cal.enabled = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Beim Outline-Laden")
      .setDesc("Termine beim Anzeigen eines Tages in der Outline synchronisieren (einmal pro Sitzung und Tag).")
      .addToggle((t) =>
        t.setValue(cal.syncOnOutlineLoad).onChange(async (value) => {
          cal.syncOnOutlineLoad = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Ganztägige Termine")
      .setDesc("Uhrzeit für ganztägige Kalender-Einträge (HH:mm).")
      .addText((t) =>
        t.setValue(cal.allDayTime).onChange(async (value) => {
          cal.allDayTime = value.trim() || "09:00";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("CalDAV-Aufgaben (VTODO)")
      .setDesc("Auch CalDAV-Todos als Termin-Zeile übernehmen.")
      .addToggle((t) =>
        t.setValue(cal.includeTodos).onChange(async (value) => {
          cal.includeTodos = value;
          await this.plugin.saveSettings();
        }),
      );

    const an = this.plugin.settings.analytics;

    containerEl.createEl("h3", { text: "Auswertung" });

    new Setting(containerEl)
      .setName("Auswertung anzeigen")
      .addToggle((t) =>
        t.setValue(an.enabled).onChange(async (value) => {
          an.enabled = value;
          await this.plugin.saveSettings();
        }),
      );

    const fallback = this.plugin.settings.dailyNoteFallback;

    containerEl.createEl("h3", { text: "Daily Notes (Fallback)" });

    new Setting(containerEl)
      .setName("Fallback-Ordner")
      .setDesc("Vault-Ordner, wenn das Core-Plugin „Daily notes“ deaktiviert ist.")
      .addText((t) =>
        t.setValue(fallback.folder).onChange(async (value) => {
          fallback.folder = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Fallback-Dateiname")
      .setDesc("Format mit YYYY, MM, DD (z. B. YYYY-MM-DD).")
      .addText((t) =>
        t.setValue(fallback.filenameFormat).onChange(async (value) => {
          fallback.filenameFormat = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Fallback-Vorlage")
      .setDesc("Optionaler Vault-Pfad zu einer Markdown-Vorlage.")
      .addText((t) =>
        t
          .setPlaceholder("x/Templates/Daily.md")
          .setValue(fallback.templatePath ?? "")
          .onChange(async (value) => {
            fallback.templatePath = value.trim() || null;
            await this.plugin.saveSettings();
          }),
      );

    const tv = this.plugin.settings.tagebuchVerweise;

    containerEl.createEl("h3", { text: "Tagebuch-Verweise" });

    new Setting(containerEl)
      .setName("Daily-Notes-Ordner")
      .setDesc("Vault-Ordner für Tagebuch-Einträge. Zeitraum und Abschnitt in der Toolbar wie in der Outline.")
      .addText((t) =>
        t.setValue(tv.dailyNotesFolder).onChange(async (value) => {
          tv.dailyNotesFolder = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Daily-Notes fileClass")
      .setDesc("Frontmatter fileClass für Tagebuch-Dateien.")
      .addText((t) =>
        t.setValue(tv.dailyNotesFileClass).onChange(async (value) => {
          tv.dailyNotesFileClass = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Zeit-Bubbles anzeigen")
      .setDesc("Uhrzeit vor Verweis-Einträgen (auch per Toolbar-Uhr umschaltbar).")
      .addToggle((t) =>
        t.setValue(tv.showTimeBubbles ?? false).onChange(async (value) => {
          tv.showTimeBubbles = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}
