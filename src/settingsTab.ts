import { App, PluginSettingTab, Setting } from "obsidian";
import type UniversalDailyNotePlugin from "./main";
import { DEFAULT_SETTINGS } from "./settings";
import { DEFAULT_SPAZIERGANG_LAYOUT_TEMPLATE } from "./notes/spaziergangLayout";
import { DEFAULT_WANDERN_LAYOUT_TEMPLATE } from "./notes/wandernLayout";
import {
  renderSettingsIntro,
  renderSettingsSection,
  renderSettingsSubheading,
  renderWalkLayoutSettings,
} from "./settings/settingsTabUi";

export class UniversalDailyNoteSettingTab extends PluginSettingTab {
  plugin: UniversalDailyNotePlugin;

  constructor(app: App, plugin: UniversalDailyNotePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("udn-settings-tab");

    containerEl.createEl("h2", { text: "Universal Daily Note" });
    renderSettingsIntro(containerEl);

    const save = () => this.plugin.saveSettings();

    this.renderGeneralAndOutline(containerEl, save);
    this.renderComposer(containerEl, save);
    this.renderIntegrations(containerEl, save);
    this.renderProfilesAndTracks(containerEl, save);
    this.renderAdvanced(containerEl, save);
  }

  private renderGeneralAndOutline(container: HTMLElement, save: () => Promise<void>): void {
    const s = this.plugin.settings;
    const ol = s.outline;
    const tv = s.tagebuchVerweise;

    renderSettingsSection(
      container,
      "Allgemein & Outline",
      (body) => {
        new Setting(body)
          .setName("Outline beim Start öffnen")
          .setDesc("Tagebuch-Outline rechts unten öffnen, wenn das Plugin aktiviert wird.")
          .addToggle((t) =>
            t.setValue(s.openPanelOnEnable).onChange(async (value) => {
              s.openPanelOnEnable = value;
              await save();
            }),
          );

        renderSettingsSubheading(body, "Timeline", "Darstellung und Filter in der Tagebuch-Outline.");

        new Setting(body)
          .setName("Zeitraum (Tage)")
          .setDesc("Anzahl Tage rückwärts ab Kalenderdatum.")
          .addText((t) =>
            t.setValue(String(ol.durationDays)).onChange(async (value) => {
              ol.durationDays = Math.max(1, parseInt(value, 10) || 365);
              await save();
            }),
          );

        new Setting(body)
          .setName("Standard-Abschnitt")
          .setDesc('Start-Abschnitt in der Outline (Standard: „Tagebuch").')
          .addText((t) =>
            t.setValue(ol.journalHeading).onChange(async (value) => {
              ol.journalHeading = value.trim() || "Tagebuch";
              await save();
            }),
          );

        new Setting(body)
          .setName("Zeitraum-Modus")
          .setDesc("Monat/Woche folgen dem Universal Calendar; „Alle“ = scrollen ohne Datumsfilter.")
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
                await save();
              }),
          );

        new Setting(body)
          .setName("Tage pro Seite")
          .setDesc('Nur im Modus „Alle“: Tage pro Ladung beim Scrollen.')
          .addText((t) =>
            t.setValue(String(ol.pageSize ?? 10)).onChange(async (value) => {
              ol.pageSize = Math.max(1, parseInt(value, 10) || 10);
              await save();
            }),
          );

        new Setting(body)
          .setName("Zeit-Bubbles in der Outline")
          .setDesc("Uhrzeit vor Einträgen (auch per Toolbar-Uhr umschaltbar).")
          .addToggle((t) =>
            t.setValue(ol.showTimeBubbles ?? true).onChange(async (value) => {
              ol.showTimeBubbles = value;
              await save();
            }),
          );

        new Setting(body)
          .setName("Gruppenfilter")
          .setDesc("Optional: nach Gruppenname filtern (Reise, Wanderung, Vorfall …).")
          .addText((t) =>
            t.setValue(ol.feedContextFilter ?? "").onChange(async (value) => {
              ol.feedContextFilter = value.trim();
              await save();
            }),
          );

        renderSettingsSubheading(body, "Tagebuch-Verweise", "Panel mit Verweisen auf Daily Notes.");

        new Setting(body)
          .setName("Daily-Notes-Ordner")
          .addText((t) =>
            t.setValue(tv.dailyNotesFolder).onChange(async (value) => {
              tv.dailyNotesFolder = value.trim();
              await save();
            }),
          );

        new Setting(body)
          .setName("Daily-Notes fileClass")
          .setDesc("Frontmatter fileClass für Tagebuch-Dateien.")
          .addText((t) =>
            t.setValue(tv.dailyNotesFileClass).onChange(async (value) => {
              tv.dailyNotesFileClass = value.trim();
              await save();
            }),
          );

        new Setting(body)
          .setName("Zeit-Bubbles in Verweisen")
          .addToggle((t) =>
            t.setValue(tv.showTimeBubbles ?? false).onChange(async (value) => {
              tv.showTimeBubbles = value;
              await save();
            }),
          );
      },
      { description: "Outline, Timeline und Verweise-Panel." },
    );
  }

  private renderComposer(container: HTMLElement, save: () => Promise<void>): void {
    const s = this.plugin.settings;
    const composer = s.composer ?? DEFAULT_SETTINGS.composer;
    const composerWindow = s.composerWindow ?? DEFAULT_SETTINGS.composerWindow;
    const tpl = s.composerTemplates ?? DEFAULT_SETTINGS.composerTemplates;
    const qc = s.quickCapture;

    renderSettingsSection(
      container,
      "Tages-Composer",
      (body) => {
        new Setting(body)
          .setName("Composer automatisch öffnen")
          .setDesc("Mobil: beim Befehl oder beim Öffnen der heutigen Daily Note.")
          .addDropdown((d) =>
            d
              .addOptions({
                never: "Nie",
                todayCommand: "Beim Befehl „Heutige Daily Note öffnen“",
                todayNoteOpen: "Beim Öffnen der heutigen Daily Note",
              })
              .setValue(composer.autoOpen)
              .onChange(async (value) => {
                composer.autoOpen = (value as typeof composer.autoOpen) || "todayCommand";
                await save();
              }),
          );

        new Setting(body)
          .setName("Fensterposition zurücksetzen")
          .setDesc("Composer wieder zentriert öffnen (Desktop).")
          .addButton((btn) =>
            btn.setButtonText("Zurücksetzen").onClick(async () => {
              composerWindow.x = null;
              composerWindow.y = null;
              await save();
            }),
          );

        body.createEl("p", {
          cls: "setting-item-description",
          text: "Ribbon „Tages-Composer“, Befehl „Heutige Notiz im Composer öffnen“ oder obsidian://udn-composer?date=YYYY-MM-DD",
        });

        renderSettingsSubheading(body, "Schnell-Chips", "Präfixe für Chip-Buttons im Composer.");

        new Setting(body)
          .setName("Zeitformat")
          .addText((t) =>
            t.setValue(qc.timeFormat).onChange(async (value) => {
              qc.timeFormat = value.trim() || "HH:mm";
              await save();
            }),
          );

        new Setting(body)
          .setName("Chip-Präfixe")
          .setDesc("Kommagetrennt, z. B. Mittagessen:, Termin:, Spaziergang:")
          .addTextArea((t) => {
            t.inputEl.rows = 4;
            t.setValue(qc.entryPrefixes.join(", ")).onChange(async (value) => {
              qc.entryPrefixes = value
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean);
              await save();
            });
          });

        new Setting(body)
          .setName("Anhänge-Ordner")
          .setDesc("Basisordner für Composer-Fotos.")
          .addText((t) =>
            t.setValue(qc.attachmentsFolder).onChange(async (value) => {
              qc.attachmentsFolder = value.trim() || qc.attachmentsFolder;
              await save();
            }),
          );

        renderSettingsSubheading(body, "Bulk-Vorlagen", "„Typischer Tag“-Vorlagen im Composer.");

        const bulkTemplates: Array<{ key: keyof typeof tpl; name: string; desc: string }> = [
          { key: "tagebuchBulkEnabled", name: "Typischer Tag (Tagebuch)", desc: "Wetter, Aufstehen, Mittagessen, Spaziergang, Termine." },
          { key: "reisenBulkEnabled", name: "Typischer Reisetag", desc: "Standort, Etappen, Highlights, optional Foto und GPX." },
          { key: "wandernBulkEnabled", name: "Typische Wanderung", desc: "Standort, Start, Kurz- und Beschreibung, optional Foto und GPX." },
          { key: "spaziergangBulkEnabled", name: "Typischer Spaziergang", desc: "Wie Wanderung, für ## Spaziergang." },
          { key: "heizungBulkEnabled", name: "Typischer Heizungseintrag", desc: "Kurz, Detail, optional Foto." },
          { key: "lueftungBulkEnabled", name: "Typischer Lüftungseintrag", desc: "Kurz, Detail, optional Foto." },
        ];

        for (const item of bulkTemplates) {
          new Setting(body)
            .setName(item.name)
            .setDesc(item.desc)
            .addToggle((t) =>
              t.setValue(tpl[item.key] ?? true).onChange(async (value) => {
                (tpl as Record<string, boolean>)[item.key] = value;
                await save();
              }),
            );
        }
      },
      { description: "Composer-Verhalten, Chips und Vorlagen." },
    );
  }

  private renderIntegrations(container: HTMLElement, save: () => Promise<void>): void {
    const s = this.plugin.settings;
    const cal = s.calendarSync;
    const garmin = s.garminSync;
    const wx = s.weatherCapture;

    renderSettingsSection(
      container,
      "Integrationen",
      (body) => {
        renderSettingsSubheading(body, "Kalender-Termine", "Universal Calendar → ## Tagebuch.");

        new Setting(body)
          .setName("Termine automatisch übernehmen")
          .setDesc("CalDAV-Termine mit Uhrzeit als „Termin:“-Zeilen in ## Tagebuch.")
          .addToggle((t) =>
            t.setValue(cal.enabled).onChange(async (value) => {
              cal.enabled = value;
              await save();
            }),
          );

        new Setting(body)
          .setName("Beim Outline-Laden synchronisieren")
          .setDesc("Einmal pro Sitzung und Tag beim Anzeigen eines Tages.")
          .addToggle((t) =>
            t.setValue(cal.syncOnOutlineLoad).onChange(async (value) => {
              cal.syncOnOutlineLoad = value;
              await save();
            }),
          );

        new Setting(body)
          .setName("CalDAV-Aufgaben (VTODO)")
          .setDesc("Todos mit konkreter Uhrzeit als Termin-Zeile.")
          .addToggle((t) =>
            t.setValue(cal.includeTodos).onChange(async (value) => {
              cal.includeTodos = value;
              await save();
            }),
          );

        body.createEl("p", {
          cls: "setting-item-description",
          text: "Nur CalDAV-Termine mit Startzeit — keine Vault-Rechnungen oder Markdown-Notizen.",
        });

        renderSettingsSubheading(
          body,
          "Garmin-Aktivitäten",
          "Import aus universal-garmin-sync (Host-Cron) in Tagebuch und ## Wandern/Spaziergang.",
        );

        new Setting(body)
          .setName("Garmin-Import aktiv")
          .addToggle((t) =>
            t.setValue(garmin.enabled).onChange(async (value) => {
              garmin.enabled = value;
              await save();
            }),
          );

        new Setting(body)
          .setName("Pending-Manifest")
          .setDesc("Pfad zur pending.json im Vault (vom Garmin-Sync geschrieben).")
          .addText((t) =>
            t.setValue(garmin.pendingManifestPath).onChange(async (value) => {
              garmin.pendingManifestPath = value.trim() || garmin.pendingManifestPath;
              await save();
            }),
          );

        new Setting(body)
          .setName("Beim Plugin-Start importieren")
          .setDesc("Desktop: pending.json beim Laden verarbeiten.")
          .addToggle((t) =>
            t.setValue(garmin.syncOnLoad).onChange(async (value) => {
              garmin.syncOnLoad = value;
              await save();
            }),
          );

        renderSettingsSubheading(body, "Wetter & Ort");

        new Setting(body)
          .setName("Frontmatter Location")
          .setDesc("Ort in Frontmatter Location: schreiben.")
          .addToggle((t) =>
            t.setValue(wx.updateFrontmatter).onChange(async (value) => {
              wx.updateFrontmatter = value;
              await save();
            }),
          );

        body.createEl("p", {
          cls: "setting-item-description",
          text: "Wetter erscheint in der Callout-Überschrift (tagebuch-ref) und in der Outline — kein eigener Tagebuch-Eintrag.",
        });
      },
      { description: "Kalender, Garmin, Wetter." },
    );
  }

  private renderProfilesAndTracks(container: HTMLElement, save: () => Promise<void>): void {
    const s = this.plugin.settings;
    const feedDetail = s.feedDetailLayout ?? DEFAULT_SETTINGS.feedDetailLayout;
    const wl = s.wandernLayout ?? DEFAULT_SETTINGS.wandernLayout;
    const sl = s.spaziergangLayout ?? DEFAULT_SETTINGS.spaziergangLayout;

    renderSettingsSection(
      container,
      "Profil-Layouts & Tracks",
      (body) => {
        renderWalkLayoutSettings(body, wl, {
          title: "Wandern",
          description: "Markdown für ## Wandern beim Speichern aus dem Composer.",
          defaultTemplate: DEFAULT_WANDERN_LAYOUT_TEMPLATE,
          save,
        });

        renderWalkLayoutSettings(body, sl, {
          title: "Spaziergang",
          description: "Markdown für ## Spaziergang beim Speichern aus dem Composer.",
          defaultTemplate: DEFAULT_SPAZIERGANG_LAYOUT_TEMPLATE,
          save,
        });

        renderSettingsSubheading(body, "Heizung & Lüftung", "Foto-Ordner für Feed-Detail-Callouts.");

        new Setting(body)
          .setName("Heizung Fotos-Ordner")
          .addText((t) =>
            t.setValue(feedDetail.heizungPhotosFolder).onChange(async (value) => {
              feedDetail.heizungPhotosFolder = value.trim() || feedDetail.heizungPhotosFolder;
              await save();
            }),
          );

        new Setting(body)
          .setName("Lüftung Fotos-Ordner")
          .setDesc("Jahres-Unterordner wird automatisch angehängt (z. B. …/2026).")
          .addText((t) =>
            t.setValue(feedDetail.lueftungPhotosFolder).onChange(async (value) => {
              feedDetail.lueftungPhotosFolder = value.trim() || feedDetail.lueftungPhotosFolder;
              await save();
            }),
          );

        new Setting(body)
          .setName("Max. Fotos (Heizung/Lüftung)")
          .addText((t) =>
            t.setValue(String(feedDetail.maxPhotos ?? 6)).onChange(async (value) => {
              feedDetail.maxPhotos = Math.max(1, Number.parseInt(value, 10) || 6);
              await save();
            }),
          );

        body.createEl("p", {
          cls: "setting-item-description",
          text: "GPX-Ordner unter Wandern/Spaziergang gelten auch für Reisen-Vorlagen und Garmin-Sync.",
        });
      },
      { description: "Callout-Layouts, Fotos und GPX-Quellen.", collapsed: true },
    );
  }

  private renderAdvanced(container: HTMLElement, save: () => Promise<void>): void {
    const s = this.plugin.settings;
    const fallback = s.dailyNoteFallback;
    const an = s.analytics;

    renderSettingsSection(
      container,
      "Erweitert",
      (body) => {
        renderSettingsSubheading(
          body,
          "Daily Notes (Fallback)",
          "Nur wenn das Core-Plugin „Daily notes“ deaktiviert ist.",
        );

        new Setting(body)
          .setName("Fallback-Ordner")
          .addText((t) =>
            t.setValue(fallback.folder).onChange(async (value) => {
              fallback.folder = value;
              await save();
            }),
          );

        new Setting(body)
          .setName("Fallback-Dateiname")
          .setDesc("Format mit YYYY, MM, DD.")
          .addText((t) =>
            t.setValue(fallback.filenameFormat).onChange(async (value) => {
              fallback.filenameFormat = value;
              await save();
            }),
          );

        new Setting(body)
          .setName("Fallback-Vorlage")
          .setDesc("Optionaler Vault-Pfad zu einer Markdown-Vorlage.")
          .addText((t) =>
            t
              .setPlaceholder("x/Templates/Daily.md")
              .setValue(fallback.templatePath ?? "")
              .onChange(async (value) => {
                fallback.templatePath = value.trim() || null;
                await save();
              }),
          );

        renderSettingsSubheading(body, "Auswertung");

        new Setting(body)
          .setName("Auswertung anzeigen")
          .setDesc("Analytics-Bereich in der Outline.")
          .addToggle((t) =>
            t.setValue(an.enabled).onChange(async (value) => {
              an.enabled = value;
              await save();
            }),
          );
      },
      { description: "Fallback-Pfade und Analytics.", collapsed: true },
    );
  }
}
