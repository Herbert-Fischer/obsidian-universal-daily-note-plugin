import { App, PluginSettingTab, Setting } from "obsidian";
import type UniversalDailyNotePlugin from "./main";
import { DEFAULT_WANDERN_LAYOUT_TEMPLATE } from "./notes/wandernLayout";

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
      .setDesc("Universal Calendar: CalDAV-Termine mit Uhrzeit als „Termin:“-Zeilen immer in ## Tagebuch.")
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
      .setName("Vault-Notizen aus Kalender")
      .setDesc("Markdown-Dateien aus Universal Calendar (nach Datum/Erstellung) als Termin übernehmen.")
      .addToggle((t) =>
        t.setValue(cal.includeMarkdownNotes ?? false).onChange(async (value) => {
          cal.includeMarkdownNotes = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("CalDAV-Aufgaben (VTODO)")
      .setDesc("Auch CalDAV-Todos als Termin-Zeile übernehmen (nur mit konkreter Uhrzeit).")
      .addToggle((t) =>
        t.setValue(cal.includeTodos).onChange(async (value) => {
          cal.includeTodos = value;
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Ganztages-Termine werden nicht übernommen — nur Einträge mit konkreter Startzeit.",
    });

    const tpl = this.plugin.settings.composerTemplates ?? {
      tagebuchBulkEnabled: true,
      reisenBulkEnabled: true,
      wandernBulkEnabled: true,
      lastTripLabel: "",
    };

    containerEl.createEl("h3", { text: "Composer-Vorlagen" });

    new Setting(containerEl)
      .setName("Typischer Tag (Tagebuch)")
      .setDesc("Bulk-Vorlage: Wetter, Aufstehen, Mittagessen, Spaziergang, Kalender-Termine.")
      .addToggle((t) =>
        t.setValue(tpl.tagebuchBulkEnabled).onChange(async (value) => {
          tpl.tagebuchBulkEnabled = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Typischer Reisetag")
      .setDesc("Bulk-Vorlage: Standort, Etappen, Highlights, optional Foto und GPX-Track.")
      .addToggle((t) =>
        t.setValue(tpl.reisenBulkEnabled).onChange(async (value) => {
          tpl.reisenBulkEnabled = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Typische Wanderung (Wandern)")
      .setDesc("Bulk-Vorlage: Standort, Start, Kurz- und Beschreibung, optional Foto und GPX-Track.")
      .addToggle((t) =>
        t.setValue(tpl.wandernBulkEnabled).onChange(async (value) => {
          tpl.wandernBulkEnabled = value;
          await this.plugin.saveSettings();
        }),
      );

    const composerWindow = this.plugin.settings.composerWindow ?? { x: null, y: null };

    containerEl.createEl("h3", { text: "Composer-Fenster" });

    new Setting(containerEl)
      .setName("Position zurücksetzen")
      .setDesc("Composer wieder zentriert öffnen (Desktop).")
      .addButton((btn) =>
        btn.setButtonText("Zurücksetzen").onClick(async () => {
          composerWindow.x = null;
          composerWindow.y = null;
          await this.plugin.saveSettings();
        }),
      );

    const wl = this.plugin.settings.wandernLayout ?? {
      template: "",
      maxPhotos: 3,
      track3dEnabled: true,
      track3dHeight: 400,
      track3dElevationExaggeration: 4,
      photosFolder: "Calendar/Anhänge/Bilder",
      tracksFolder: "Calendar/Anhänge/GPX",
    };
    if (!wl.template.trim()) {
      wl.template = DEFAULT_WANDERN_LAYOUT_TEMPLATE;
    }

    containerEl.createEl("h3", { text: "Wandern-Layout" });

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Platzhalter: {{titel}}, {{kurz}}, {{beschreibung}}, {{track_summary}}, {{track_link}}, {{track_gpx}}, {{track3d}}, {{fotos}}, {{foto1}}…{{fotoN}}, {{datum}}. Fotos: <Fotos-Ordner>/<Callout-Titel>/01.jpg. GPX: <Track-Ordner>/<Callout-Titel>.gpx.",
    });

    new Setting(containerEl)
      .setName("Fotos-Ordner")
      .setDesc("Basisordner für Wandern-Fotos; Unterordner = Callout-Titel (z. B. Calendar/Anhänge/Bilder).")
      .addText((t) =>
        t.setValue(wl.photosFolder ?? "Calendar/Anhänge/Bilder").onChange(async (value) => {
          wl.photosFolder = value.trim() || "Calendar/Anhänge/Bilder";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Track-Ordner")
      .setDesc("Zielordner für GPX beim Speichern; Dateiname = Callout-Titel (z. B. Calendar/Anhänge/GPX).")
      .addText((t) =>
        t.setValue(wl.tracksFolder ?? "Calendar/Anhänge/GPX").onChange(async (value) => {
          wl.tracksFolder = value.trim() || "Calendar/Anhänge/GPX";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Markdown-Vorlage")
      .setDesc("Wird beim Speichern von ## Wandern in die Daily Note geschrieben.")
      .addTextArea((t) => {
        t.inputEl.rows = 12;
        t.setValue(wl.template).onChange(async (value) => {
          wl.template = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Max. Fotos")
      .addText((t) =>
        t.setValue(String(wl.maxPhotos ?? 3)).onChange(async (value) => {
          const n = Math.max(1, Number.parseInt(value, 10) || 3);
          wl.maxPhotos = n;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("3D-Track in Vorlage")
      .setDesc("{{track3d}} erzeugt einen udn-track-3d Codeblock.")
      .addToggle((t) =>
        t.setValue(wl.track3dEnabled ?? true).onChange(async (value) => {
          wl.track3dEnabled = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("3D-Track Höhe (px)")
      .addText((t) =>
        t.setValue(String(wl.track3dHeight ?? 400)).onChange(async (value) => {
          const n = Math.max(120, Number.parseInt(value, 10) || 400);
          wl.track3dHeight = n;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("3D-Track Höhen-Exaggeration")
      .setDesc("Vertikale Überhöhung der GPX-Höhendaten (Standard 4).")
      .addText((t) =>
        t.setValue(String(wl.track3dElevationExaggeration ?? 4)).onChange(async (value) => {
          const n = Math.max(1, Number.parseFloat(value) || 4);
          wl.track3dElevationExaggeration = n;
          await this.plugin.saveSettings();
        }),
      );

    const tr = this.plugin.settings.tracks ?? { enabled: true, folder: "Calendar/Tracks" };

    containerEl.createEl("h3", { text: "GPS-Tracks" });

    new Setting(containerEl)
      .setName("Tracks für Reisen- und Wandern-Vorlage")
      .setDesc("GPX/TCX aus Vault-Ordner laden (Dateiname enthält YYYY-MM-DD).")
      .addToggle((t) =>
        t.setValue(tr.enabled).onChange(async (value) => {
          tr.enabled = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Track-Ordner")
      .setDesc("z. B. Calendar/Tracks/Garmin oder Calendar/Tracks/Google")
      .addText((t) =>
        t.setValue(tr.folder).onChange(async (value) => {
          tr.folder = value.trim() || "Calendar/Tracks";
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Garmin: GPX pro Aktivität exportieren. Google Timeline: JSON am Android-Gerät exportieren und mit einem Konverter in Tages-GPX umwandeln.",
    });

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
