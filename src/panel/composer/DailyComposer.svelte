<script lang="ts">
  import { onMount, onDestroy, afterUpdate, tick } from "svelte";
  import type { App } from "obsidian";
  import { Menu, Notice, setIcon } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import type { DailyNoteFallbackSettings, TagebuchVerweiseSettings, CalendarSyncSettings, ComposerTemplatesSettings, TracksSettings, WandernLayoutSettings } from "../../settings";
  import { DEFAULT_SETTINGS } from "../../settings";
  import { addLocalDays, formatTimeLocal, normalizeLocalDay } from "../dateUtils";
  import { formatDayBubbleLabel } from "../formatDayBubble";
  import {
    buildChipEntryText,
    chipsForHeading,
    composerEntryText,
    loadComposerSectionHeadings,
    loadComposerState,
    saveComposerState,
    suggestSummaryFromEntries,
    type ComposerChip,
    type ComposerEntry,
  } from "../../notes/dailyComposer";
  import { openOrCreateDailyNoteForDate } from "../../notes/dailyNote";
  import { formatJournalEntryText, parseJournalEntryDisplay } from "../../notes/parseJournalEntryDisplay";
  import { openWikiLinkInMain } from "../../notes/openInMainPane";
  import JournalBodyInput from "./JournalBodyInput.svelte";
  import { wikiLinkSuggest } from "../wikiLinkInputSuggest";
  import { WEATHER_VORLAGE_LABEL } from "../../weather/insertWeather";
  import { WEATHER_ICON } from "../../weather/weatherUi";
  import { isWikiLinkSuggestOpen } from "../wikiLinkInputSuggest";
  import {
    applyBulkTemplate,
    shouldConfirmBulkApply,
    templatesForHeading,
    type ComposerTemplatePack,
  } from "../../notes/composerTemplates";
  import { findAllTracksInFolder, findTracksForDay, formatTrackSummary, type TrackMatch } from "../../tracks/gpxImport";
  import { trackPickOptionsForDay, type TrackPickOption } from "../../tracks/trackPickModal";
  import { importAttachmentFile, importWandernAttachmentFile, wikiEmbedForPath } from "../../notes/attachJournalMedia";
  import {
    applyKeyboardInset,
    estimateKeyboardInset,
    observeDockHeight,
    scrollInputIntoView,
  } from "./mobileViewport";
  import WandernComposerFields from "./WandernComposerFields.svelte";
  import {
    applyWandernBulkFields,
    loadWandernComposerData,
    renderWandernTemplate,
    saveWandernComposerState,
  } from "../../notes/wandernLayout";
  import { reverseGeocode, getCurrentPosition } from "../../weather/openMeteo";

  export let app: App;
  export let date: Date;
  export let fallback: DailyNoteFallbackSettings;
  export let initialJournalHeading: string;
  export let excludedHeadings: string[] = [];
  export let durationDays = 365;
  export let tagebuchSettings: TagebuchVerweiseSettings;
  export let entryPrefixes: string[] = [];
  export let calendarSync: CalendarSyncSettings = DEFAULT_SETTINGS.calendarSync;
  export let composerTemplates: ComposerTemplatesSettings = DEFAULT_SETTINGS.composerTemplates;
  export let tracksSettings: TracksSettings = DEFAULT_SETTINGS.tracks;
  export let wandernLayout: WandernLayoutSettings = DEFAULT_SETTINGS.wandernLayout;
  export let attachmentsFolder = DEFAULT_SETTINGS.quickCapture.attachmentsFolder;
  export let weatherLastLocation = "";
  export let onPersistSideEffects: (patch: {
    lastLocation?: string;
    lastTripLabel?: string;
  }) => void = () => {};
  export let timeFormat = "HH:mm";
  export let onClose: () => void = () => {};
  export let onSaved: (date: Date) => void = () => {};
  export let onDateChange: (d: Date) => void = () => {};
  export let onHeadingChange: (heading: string) => void = () => {};
  export let isMobile = false;
  export let onInsertWeather: () => Promise<boolean> = async () => false;

  let currentDate = normalizeLocalDay(date);
  let activeHeading = initialJournalHeading.trim() || "Tagebuch";
  let sectionHeadings: string[] = [activeHeading];
  let loading = true;
  let saving = false;
  let loadError = "";
  let filePath = "";
  let summary = "";
  let calloutTitle = "";
  let summaryTouched = false;
  let entries: ComposerEntry[] = [];
  let chips: ComposerChip[] = [];
  let newEntryText = "";
  let newEntryTime = "";
  let modified = false;
  let prevBtn: HTMLButtonElement;
  let nextBtn: HTMLButtonElement;
  let nowBtn: HTMLButtonElement;
  let closeBtn: HTMLButtonElement;
  let headingBtn: HTMLButtonElement;
  let headingIconEl: HTMLSpanElement;
  let prefixBtn: HTMLButtonElement;
  let prefixIconEl: HTMLSpanElement;
  let composerRoot: HTMLDivElement;
  let mobileDock: HTMLDivElement;
  let addInput: HTMLInputElement;
  let detachDockObserver: (() => void) | null = null;
  let dockObserverAttached = false;
  let loadGeneration = 0;
  let weatherBusy = false;
  let templateBusy = false;
  let templateFileInput: HTMLInputElement;
  let pendingTemplatePack: ComposerTemplatePack | null = null;
  let pendingBulkOptions: { onlyMissing: boolean; selectedTrack: TrackMatch | null } | null = null;
  let pendingWandernPhoto = false;
  let wandernTitel = "";
  let wandernKurz = "";
  let wandernBeschreibung = "";
  let wandernTrack: TrackMatch | null = null;
  let wandernPhotos: string[] = [];
  let wandernShowPreview = false;
  let wandernTrackPickerOpen = false;
  let wandernTrackPickerLoading = false;
  let wandernTrackOptions: TrackPickOption[] = [];

  $: isWandernMode = activeHeading.trim().toLowerCase() === "wandern";
  $: wandernPreviewMarkdown = isWandernMode
    ? renderWandernTemplate({
        titel: wandernTitel || calloutTitle,
        kurz: wandernKurz,
        beschreibung: wandernBeschreibung,
        track: wandernTrack,
        photos: wandernPhotos,
        date: currentDate,
        layout: wandernLayout,
      })
    : "";

  $: chips = chipsForHeading(activeHeading, entryPrefixes);
  $: bulkTemplates = templatesForHeading(activeHeading, composerTemplates);
  $: prefixMenuEnabled = chips.length > 0 || bulkTemplates.length > 0 || !!onInsertWeather;
  $: dateLabel = formatDayBubbleLabel(
    `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`,
  );
  $: weekdayShort = currentDate.toLocaleDateString("de-DE", { weekday: "short" });

  onMount(() => {
    void reload();
    updateNavButtons();
  });

  onDestroy(() => {
    detachDockObserver?.();
  });

  async function reload() {
    const generation = ++loadGeneration;
    loading = true;
    loadError = "";
    modified = false;
    onDateChange(currentDate);
    try {
      if (calendarSync?.enabled) {
        try {
          const { syncCalendarAppointmentsIntoDailyNote } = await import("../../integrations/calendarAppointments");
          await syncCalendarAppointmentsIntoDailyNote(app, {
            date: currentDate,
            fallback,
            settings: calendarSync,
          });
        } catch (syncErr) {
          console.warn("Universal Daily Note: Kalender-Sync beim Composer-Laden", syncErr);
        }
      }
      const [state, headings] = await Promise.all([
        loadComposerState(app, currentDate, fallback, activeHeading),
        loadComposerSectionHeadings(app, currentDate, fallback, tagebuchSettings, {
          excludedHeadings,
          defaultHeading: activeHeading,
          durationDays,
        }),
      ]);
      if (generation !== loadGeneration) return;
      sectionHeadings = headings.length > 0 ? headings : [activeHeading];
      if (!sectionHeadings.some((h) => h.toLowerCase() === activeHeading.toLowerCase())) {
        sectionHeadings = [activeHeading, ...sectionHeadings];
      }
      filePath = state.file.path;
      if (activeHeading.trim().toLowerCase() === "wandern") {
        const wandern = await loadWandernComposerData(app, state.file, state.calloutTitle || "Wandern");
        wandernTitel = wandern.titel;
        wandernKurz = wandern.kurz;
        wandernBeschreibung = wandern.beschreibung;
        wandernTrack = wandern.track;
        wandernPhotos = [...wandern.photos];
        calloutTitle = wandern.titel;
        entries = [];
      } else {
        entries = state.entries.map((e) => ({ ...e }));
        calloutTitle = state.calloutTitle;
      }
      summary = state.summary;
      summaryTouched = Boolean(state.summary.trim());
      newEntryText = "";
      newEntryTime = currentTime();
    } catch (e) {
      if (generation !== loadGeneration) return;
      loadError = "Tagesnotiz konnte nicht geladen werden.";
      console.error("Universal Daily Note: Composer load", e);
    } finally {
      if (generation === loadGeneration) loading = false;
    }
  }

  function currentTime(): string {
    return formatTimeLocal(new Date(), timeFormat);
  }

  function markModified() {
    modified = true;
  }

  function addChipEntry(chip: ComposerChip) {
    const time = chip.defaultTime ?? currentTime();
    const { time: entryTime, body } = parseJournalEntryDisplay(buildChipEntryText(chip, time));
    entries = [...entries, makeNewEntry(entryTime ?? time, body)];
    markModified();
    if (!summaryTouched) {
      summary = suggestSummaryFromEntries(entries.map(composerEntryText));
    }
  }

  function makeNewEntry(time: string, body: string): ComposerEntry {
    const id = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const text = composerEntryText({ time, body }).trim();
    return { id, line: -1, time, body, rawLine: `- ${text}` };
  }

  function addFreeEntry() {
    const body = newEntryText.trim();
    if (!body) return;
    const time = newEntryTime.trim() || currentTime();
    entries = [...entries, makeNewEntry(time, body)];
    newEntryText = "";
    markModified();
    if (!summaryTouched) {
      summary = suggestSummaryFromEntries(entries.map(composerEntryText));
    }
    if (isMobile && addInput) {
      addInput.focus();
    }
  }

  function updateEntry(id: string, patch: Partial<Pick<ComposerEntry, "time" | "body">>) {
    entries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
    markModified();
    if (!summaryTouched) {
      summary = suggestSummaryFromEntries(entries.map(composerEntryText));
    }
  }

  function removeEntry(id: string) {
    entries = entries.filter((e) => e.id !== id);
    markModified();
    if (!summaryTouched) {
      summary = suggestSummaryFromEntries(entries.map((e) => e.text));
    }
  }

  function onSummaryInput(ev: Event) {
    summaryTouched = true;
    summary = (ev.currentTarget as HTMLInputElement).value;
    markModified();
  }

  function onCalloutTitleInput(ev: Event) {
    calloutTitle = (ev.currentTarget as HTMLInputElement).value;
    if (isWandernMode) wandernTitel = calloutTitle;
    markModified();
  }

  async function shiftDate(delta: number) {
    if (modified && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
    currentDate = addLocalDays(currentDate, delta);
    onDateChange(currentDate);
    await reload();
  }

  async function goToday() {
    if (modified && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
    currentDate = normalizeLocalDay(new Date());
    onDateChange(currentDate);
    await reload();
  }

  async function selectHeading(heading: string) {
    if (heading.toLowerCase() === activeHeading.toLowerCase()) return;
    if (modified && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
    activeHeading = heading;
    onHeadingChange(heading);
    await reload();
  }

  function openHeadingMenu(ev: MouseEvent) {
    if (sectionHeadings.length <= 1) return;
    const menu = new Menu();
    for (const heading of sectionHeadings) {
      menu.addItem((item) => {
        item.setTitle(heading);
        item.setChecked(heading.toLowerCase() === activeHeading.toLowerCase());
        item.onClick(() => {
          void selectHeading(heading);
        });
      });
    }
    const target = ev.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
  }

  function onHeadingFilterClick(ev: MouseEvent) {
    openHeadingMenu(ev);
  }

  function openPrefixMenu(ev: MouseEvent) {
    if (!prefixMenuEnabled) return;
    const menu = new Menu();
    const heading = activeHeading.trim().toLowerCase();

    for (const pack of bulkTemplates) {
      menu.addItem((item) => {
        item.setTitle(pack.label);
        item.setIcon("layout-template");
        item.onClick(() => void runBulkTemplate(pack));
      });
    }

    if (bulkTemplates.length > 0 && (heading === "tagebuch" || heading === "reisen" || chips.length > 0)) {
      menu.addSeparator();
    }

    if (heading === "tagebuch" || heading === "reisen") {
      menu.addItem((item) => {
        item.setTitle(WEATHER_VORLAGE_LABEL);
        item.setIcon(WEATHER_ICON);
        item.onClick(() => void runWeatherVorlage());
      });
    }

    for (const chip of chips) {
      menu.addItem((item) => {
        item.setTitle(chip.label);
        item.onClick(() => addChipEntry(chip));
      });
    }
    const target = ev.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
  }

  function bulkPhotoConfirmMessage(heading: string): string {
    const h = heading.trim().toLowerCase();
    if (h === "wandern") return "Foto zur Wanderung hinzufügen?";
    if (h === "reisen") return "Foto zur Reise hinzufügen?";
    return "Foto hinzufügen?";
  }

  async function runBulkTemplate(pack: ComposerTemplatePack) {
    if (templateBusy) return;
    if (isWandernMode) {
      if (
        (wandernKurz || wandernBeschreibung || wandernTrack || wandernPhotos.length > 0) &&
        !confirm("Vorlage auf Wandern-Felder anwenden?")
      ) {
        return;
      }
    } else if (shouldConfirmBulkApply(entries)) {
      if (!confirm("Nur fehlende Vorlagen-Einträge ergänzen?")) return;
    }

    let onlyMissing = true;
    let selectedTrack: TrackMatch | null = null;
    if (pack.actions?.includes("track") && tracksSettings.enabled) {
      const tracks = await findTracksForDay(app, currentDate, tracksSettings);
      if (tracks.length === 1) {
        selectedTrack = tracks[0]!;
      } else if (tracks.length > 1) {
        selectedTrack = await pickTrack(tracks);
      }
    }

    if (pack.actions?.includes("photo") && confirm(bulkPhotoConfirmMessage(activeHeading))) {
      pendingTemplatePack = pack;
      pendingBulkOptions = { onlyMissing, selectedTrack };
      pendingWandernPhoto = isWandernMode;
      templateFileInput?.click();
      return;
    }

    if (isWandernMode) {
      await executeWandernBulkTemplate(pack, { selectedTrack });
      return;
    }

    await executeBulkTemplate(pack, {
      onlyMissing,
      includePhoto: false,
      selectedTrack,
    });
  }

  function pickTrack(tracks: TrackMatch[]): Promise<TrackMatch | null> {
    return new Promise((resolve) => {
      let resolved = false;
      const done = (value: TrackMatch | null) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };
      const menu = new Menu();
      for (const track of tracks) {
        menu.addItem((item) => {
          item.setTitle(`${track.name} · ${formatTrackSummary(track)}`);
          item.onClick(() => done(track));
        });
      }
      menu.addItem((item) => {
        item.setTitle("Ohne Track");
        item.onClick(() => done(null));
      });
      menu.showAtPosition({ x: window.innerWidth / 2 - 80, y: window.innerHeight / 3 });
    });
  }

  async function onWandernPickTrackClick() {
    if (wandernTrackPickerOpen) {
      wandernTrackPickerOpen = false;
      return;
    }
    if (!tracksSettings.enabled) {
      new Notice("GPX-Tracks sind in den Einstellungen deaktiviert.");
      return;
    }

    wandernTrackPickerOpen = true;
    wandernTrackPickerLoading = true;
    wandernTrackOptions = [];
    try {
      const dayTracks = await findTracksForDay(app, currentDate, tracksSettings);
      const allTracks = await findAllTracksInFolder(app, tracksSettings);
      const dayPaths = new Set(dayTracks.map((t) => t.path));
      const otherTracks = allTracks.filter((t) => !dayPaths.has(t.path));
      if (dayTracks.length === 0 && otherTracks.length === 0) {
        new Notice(`Keine GPX-Dateien in „${tracksSettings.folder}“ gefunden.`);
        wandernTrackPickerOpen = false;
        return;
      }
      wandernTrackOptions = trackPickOptionsForDay(dayTracks, otherTracks);
    } catch (e) {
      console.error("Universal Daily Note: GPX-Tracks laden", e);
      new Notice("GPX-Tracks konnten nicht geladen werden.");
      wandernTrackPickerOpen = false;
    } finally {
      wandernTrackPickerLoading = false;
    }
  }

  function onWandernTrackOptionPick(option: TrackPickOption) {
    wandernTrack = option.track;
    wandernTrackPickerOpen = false;
    markModified();
    if (option.track) {
      new Notice(`Track: ${option.track.name}`);
    }
  }

  function onWandernClearTrackClick() {
    wandernTrack = null;
    markModified();
  }

  async function importWandernPhotoFile(file: File | null) {
    if (!file) return;
    const maxPhotos = wandernLayout.maxPhotos ?? 3;
    if (wandernPhotos.length >= maxPhotos) {
      new Notice(`Maximal ${maxPhotos} Fotos.`);
      return;
    }
    templateBusy = true;
    try {
      const path = await importWandernAttachmentFile(
        app,
        file,
        wandernPhotos.length,
        wandernTitel || calloutTitle || "Wandern",
        wandernLayout.photosFolder ?? "Calendar/Anhänge/Bilder",
      );
      wandernPhotos = [...wandernPhotos, path];
      markModified();
      new Notice("Foto hinzugefügt.");
    } catch (e) {
      console.error("Universal Daily Note: Wandern Foto", e);
      new Notice("Foto konnte nicht gespeichert werden.");
    } finally {
      templateBusy = false;
    }
  }

  async function onTemplatePhotoSelected(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const selectedFile = input.files?.item(0) ?? null;
    const pack = pendingTemplatePack;
    const opts = pendingBulkOptions;
    const wandernDirectPhoto = pendingWandernPhoto && !pack;
    pendingTemplatePack = null;
    pendingBulkOptions = null;
    pendingWandernPhoto = false;

    try {
      if (wandernDirectPhoto) {
        await importWandernPhotoFile(selectedFile);
        return;
      }

      if (!pack || !opts) return;

      templateBusy = true;
      try {
        let photoEmbed: string | undefined;
        if (selectedFile) {
          const path = isWandernMode
            ? await importWandernAttachmentFile(
                app,
                selectedFile,
                wandernPhotos.length,
                wandernTitel || calloutTitle || "Wandern",
                wandernLayout.photosFolder ?? "Calendar/Anhänge/Bilder",
              )
            : await importAttachmentFile(app, selectedFile, currentDate, attachmentsFolder);
          photoEmbed = wikiEmbedForPath(path);
        }
        if (isWandernMode) {
          const updated = applyWandernBulkFields(
            {
              titel: wandernTitel || calloutTitle || "Wandern",
              kurz: wandernKurz,
              beschreibung: wandernBeschreibung,
              track: opts.selectedTrack ?? wandernTrack,
              photos: wandernPhotos,
            },
            {
              track: opts.selectedTrack ?? wandernTrack,
              photoPath: photoEmbed ? photoEmbed.replace(/^!\[\[|\]\]$/g, "") : undefined,
              maxPhotos: wandernLayout.maxPhotos ?? 3,
            },
          );
          wandernTitel = updated.titel;
          wandernTrack = updated.track;
          wandernPhotos = updated.photos;
          calloutTitle = updated.titel;
          markModified();
        } else {
          await executeBulkTemplate(pack, {
            onlyMissing: opts.onlyMissing,
            includePhoto: Boolean(photoEmbed),
            photoEmbed,
            selectedTrack: opts.selectedTrack,
          });
        }
      } catch (e) {
        console.error("Universal Daily Note: Vorlage Foto", e);
        new Notice("Foto konnte nicht gespeichert werden.");
      } finally {
        templateBusy = false;
      }
    } finally {
      input.value = "";
    }
  }

  function onWandernAddPhotoClick() {
    pendingTemplatePack = null;
    pendingBulkOptions = null;
    pendingWandernPhoto = true;
    templateFileInput?.click();
  }

  function onWandernRemovePhoto(index: number) {
    wandernPhotos = wandernPhotos.filter((_, i) => i !== index);
    markModified();
  }

  async function executeWandernBulkTemplate(
    pack: ComposerTemplatePack,
    options: { selectedTrack: TrackMatch | null },
  ) {
    templateBusy = true;
    try {
      let locationLabel = "";
      if (pack.actions?.includes("location")) {
        try {
          const pos = await getCurrentPosition();
          const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          locationLabel = place.placeName.split(",")[0]?.trim() ?? place.placeName;
          onPersistSideEffects({ lastLocation: place.placeName });
        } catch {
          locationLabel = weatherLastLocation.trim().split(",")[0]?.trim() ?? weatherLastLocation.trim();
        }
      }
      const updated = applyWandernBulkFields(
        {
          titel: wandernTitel || calloutTitle || "Wandern",
          kurz: wandernKurz,
          beschreibung: wandernBeschreibung,
          track: wandernTrack,
          photos: wandernPhotos,
        },
        {
          locationLabel,
          track: options.selectedTrack ?? wandernTrack,
          maxPhotos: wandernLayout.maxPhotos ?? 3,
        },
      );
      wandernTitel = updated.titel;
      wandernTrack = updated.track;
      wandernPhotos = updated.photos;
      calloutTitle = updated.titel;
      markModified();
    } catch (e) {
      console.error("Universal Daily Note: Wandern-Vorlage", e);
    } finally {
      templateBusy = false;
    }
  }

  async function executeBulkTemplate(
    pack: ComposerTemplatePack,
    options: {
      onlyMissing: boolean;
      includePhoto: boolean;
      photoEmbed?: string;
      selectedTrack: TrackMatch | null;
    },
  ) {
    templateBusy = true;
    try {
      const result = await applyBulkTemplate(pack, {
        app,
        date: currentDate,
        fallback,
        heading: activeHeading,
        entries,
        calloutTitle,
        calendarSync,
        templateSettings: composerTemplates,
        tracksSettings,
        lastLocation: weatherLastLocation,
        onlyMissing: options.onlyMissing,
        includePhoto: options.includePhoto,
        photoEmbed: options.photoEmbed,
        selectedTrack: options.selectedTrack,
      });
      entries = result.entries;
      calloutTitle = result.calloutTitle;
      markModified();
      if (!summaryTouched) {
        summary = suggestSummaryFromEntries(entries.map(composerEntryText));
      }
      onPersistSideEffects({
        lastLocation: result.lastLocation,
        lastTripLabel: result.lastTripLabel,
      });
      if (result.lastTripLabel) {
        composerTemplates = { ...composerTemplates, lastTripLabel: result.lastTripLabel };
      }
    } catch (e) {
      console.error("Universal Daily Note: Vorlage", e);
    } finally {
      templateBusy = false;
    }
  }

  function onPrefixFilterClick(ev: MouseEvent) {
    openPrefixMenu(ev);
  }

  async function runWeatherVorlage() {
    if (weatherBusy) return;
    weatherBusy = true;
    try {
      const ok = await onInsertWeather();
      if (ok) {
        const state = await loadComposerState(app, currentDate, fallback, activeHeading);
        calloutTitle = state.calloutTitle;
        summary = state.summary;
      }
    } finally {
      weatherBusy = false;
    }
  }

  function collectEntryTextsForSave(): string[] {
    const texts = entries.map(composerEntryText);
    const pending = newEntryText.trim();
    if (pending) {
      texts.push(formatJournalEntryText(newEntryTime.trim() || currentTime(), pending));
    }
    return texts;
  }

  async function save() {
    if (saving) return;
    saving = true;
    try {
      const state = await loadComposerState(app, currentDate, fallback, activeHeading);
      if (isWandernMode) {
        await saveWandernComposerState(
          app,
          state.file,
          summary,
          currentDate,
          {
            titel: wandernTitel || calloutTitle || "Wandern",
            kurz: wandernKurz,
            beschreibung: wandernBeschreibung,
            track: wandernTrack,
            photos: wandernPhotos,
          },
          wandernLayout,
        );
      } else {
        const entryTexts = collectEntryTextsForSave();
        await saveComposerState(
          app,
          {
            file: state.file,
            journalHeading: activeHeading,
            calloutTitle,
            summary,
            dateKey: state.dateKey,
          },
          entryTexts,
        );
      }
      if (calendarSync?.enabled) {
        const { syncCalendarAppointmentsIntoDailyNote } = await import("../../integrations/calendarAppointments");
        await syncCalendarAppointmentsIntoDailyNote(app, {
          date: currentDate,
          fallback,
          settings: calendarSync,
        });
      }
      onSaved(currentDate);
      onClose();
    } catch (e) {
      console.error("Universal Daily Note: Composer save", e);
      loadError = "Speichern fehlgeschlagen.";
    } finally {
      saving = false;
    }
  }

  async function openInEditor() {
    await openOrCreateDailyNoteForDate(app, currentDate, fallback);
  }

  function onEntryTimeInput(id: string, ev: Event) {
    updateEntry(id, { time: (ev.currentTarget as HTMLInputElement).value });
  }

  function openComposerWikiLink(dest: string) {
    void openWikiLinkInMain(app, dest, filePath);
  }

  function onEntryBodyInput(id: string, body: string) {
    updateEntry(id, { body });
  }

  function applyNewEntryWikiLink(next: string, cursor: number) {
    newEntryText = next;
    void tick().then(() => {
      addInput?.focus();
      addInput?.setSelectionRange(cursor, cursor);
    });
  }

  function onNewEntryKeydown(ev: KeyboardEvent) {
    if (ev.key !== "Enter" || ev.isComposing || ev.shiftKey) return;
    if (isWikiLinkSuggestOpen()) return;
    ev.preventDefault();
    ev.stopPropagation();
    addFreeEntry();
  }

  function onMobileInputFocus(ev: FocusEvent) {
    if (!isMobile || !composerRoot) return;
    const el = ev.currentTarget as HTMLElement;
    applyKeyboardInset(composerRoot, estimateKeyboardInset());
    scrollInputIntoView(el, composerRoot);
  }

  function ensureIcon(el: HTMLElement | undefined, icon: string) {
    if (!el) return;
    if (el.dataset.udnIcon === icon) return;
    setIcon(el, icon);
    el.dataset.udnIcon = icon;
  }

  function updateNavButtons() {
    if (prevBtn) {
      ensureIcon(prevBtn, "chevron-left");
      prevBtn.title = "Vorheriger Tag";
    }
    if (nextBtn) {
      ensureIcon(nextBtn, "chevron-right");
      nextBtn.title = "Nächster Tag";
    }
    if (nowBtn) {
      ensureIcon(nowBtn, "calendar-check");
      nowBtn.title = "Heute";
    }
    if (closeBtn) {
      ensureIcon(closeBtn, "x");
      closeBtn.title = "Schließen";
    }
    if (headingIconEl) {
      ensureIcon(headingIconEl, "heading");
    }
    if (headingBtn) {
      headingBtn.setAttribute("aria-label", `Abschnitt: ${activeHeading}`);
      headingBtn.title = activeHeading;
    }
    if (prefixIconEl) {
      ensureIcon(prefixIconEl, "list-plus");
    }
    if (prefixBtn) {
      prefixBtn.setAttribute("aria-label", "Vorlage wählen");
      prefixBtn.title = "Vorlage wählen";
    }
  }

  afterUpdate(() => {
    updateNavButtons();
    if (isMobile && mobileDock && composerRoot && !dockObserverAttached) {
      detachDockObserver = observeDockHeight(mobileDock, composerRoot);
      dockObserverAttached = true;
    }
  });
</script>

<div class="udn-composer" class:udn-composer--mobile={isMobile} bind:this={composerRoot}>
  <input
    type="file"
    accept="image/*"
    class="udn-composerHiddenFile"
    bind:this={templateFileInput}
    on:change={onTemplatePhotoSelected}
  />
  <header class="udn-composerHead">
    {#if isMobile}
      <div class="udn-composerHeadCompact">
        <div class="udn-composerHeadCompactTop">
          <button type="button" bind:this={closeBtn} class={dk.iconRoundBtn} on:click={onClose} aria-label="Schließen"></button>
          <span class="udn-composerDateShort">{weekdayShort} · {dateLabel}</span>
          <div class="udn-composerHeadCompactNav">
            <button type="button" bind:this={prevBtn} class={dk.iconRoundBtn} on:click={() => shiftDate(-1)} aria-label="Vorheriger Tag"></button>
            <button type="button" bind:this={nextBtn} class={dk.iconRoundBtn} on:click={() => shiftDate(1)} aria-label="Nächster Tag"></button>
            <button type="button" bind:this={nowBtn} class={dk.iconRoundBtn} on:click={goToday} aria-label="Heute"></button>
          </div>
        </div>
        <div class="udn-composerFilterBubbles">
          <button
            type="button"
            bind:this={headingBtn}
            class="udn-headingFilter udn-composerHeadingFilter"
            class:udn-headingFilter--menu={sectionHeadings.length > 1}
            disabled={sectionHeadings.length <= 1}
            on:click={onHeadingFilterClick}
          >
            <span class="udn-headingFilterIcon" bind:this={headingIconEl} aria-hidden="true"></span>
            <span class="udn-headingFilterLabel">{activeHeading}</span>
          </button>
          <button
            type="button"
            bind:this={prefixBtn}
            class="udn-headingFilter udn-composerPrefixFilter udn-headingFilter--menu"
            disabled={!prefixMenuEnabled}
            on:click={onPrefixFilterClick}
          >
            <span class="udn-headingFilterIcon" bind:this={prefixIconEl} aria-hidden="true"></span>
            <span class="udn-headingFilterLabel">Vorlage</span>
          </button>
        </div>
      </div>
    {:else}
      <div class="udn-composerHeadNav">
        <button type="button" bind:this={prevBtn} class={dk.iconRoundBtn} on:click={() => shiftDate(-1)} aria-label="Vorheriger Tag"></button>
        <div class="udn-composerHeadDate">
          <strong>{currentDate.toLocaleDateString("de-DE", { weekday: "long" })}, {dateLabel}</strong>
        </div>
        <button type="button" bind:this={nextBtn} class={dk.iconRoundBtn} on:click={() => shiftDate(1)} aria-label="Nächster Tag"></button>
        <button type="button" bind:this={nowBtn} class={dk.iconRoundBtn} on:click={goToday} aria-label="Heute"></button>
      </div>
      <div class="udn-composerFilterBubbles">
        <button
          type="button"
          bind:this={headingBtn}
          class="udn-headingFilter udn-composerHeadingFilter"
          class:udn-headingFilter--menu={sectionHeadings.length > 1}
          disabled={sectionHeadings.length <= 1}
          on:click={onHeadingFilterClick}
        >
          <span class="udn-headingFilterIcon" bind:this={headingIconEl} aria-hidden="true"></span>
          <span class="udn-headingFilterLabel">{activeHeading}</span>
        </button>
        <button
          type="button"
          bind:this={prefixBtn}
          class="udn-headingFilter udn-composerPrefixFilter udn-headingFilter--menu"
          disabled={!prefixMenuEnabled}
          on:click={onPrefixFilterClick}
        >
          <span class="udn-headingFilterIcon" bind:this={prefixIconEl} aria-hidden="true"></span>
          <span class="udn-headingFilterLabel">Vorlage</span>
        </button>
      </div>
    {/if}

    {#if !isMobile}
      <label class="udn-composerSummary">
        <span class="udn-composerSummaryLabel">Zusammenfassung</span>
        <input
          type="text"
          class="{dk.input} udn-composerSummaryInput"
          value={summary}
          on:input={onSummaryInput}
          on:focus={onMobileInputFocus}
          placeholder="Kurzüberblick für Frontmatter…"
        />
      </label>
      <label class="udn-composerSummary">
        <span class="udn-composerSummaryLabel">Callout-Titel</span>
        <input
          type="text"
          class="{dk.input} udn-composerSummaryInput"
          value={calloutTitle}
          on:input={onCalloutTitleInput}
          on:focus={onMobileInputFocus}
          placeholder="Titel in der Callout-Zeile…"
        />
      </label>
    {/if}
  </header>

  {#if loading}
    <p class={dk.empty}>Lade…</p>
  {:else if loadError}
    <p class="{dk.empty} udn-composerError">{loadError}</p>
  {:else}
    <section class="udn-composerSection">
      {#if isMobile}
        <label class="udn-composerCalloutTitle">
          <span class="udn-composerSummaryLabel">Zusammenfassung</span>
          <input
            type="text"
            class="{dk.input} udn-composerSummaryInput"
            value={summary}
            on:input={onSummaryInput}
            on:focus={onMobileInputFocus}
            placeholder="Kurzüberblick für Frontmatter…"
          />
        </label>
        <label class="udn-composerCalloutTitle">
          <span class="udn-composerSummaryLabel">Callout-Titel</span>
          <input
            type="text"
            class="{dk.input} udn-composerSummaryInput"
            value={calloutTitle}
            on:input={onCalloutTitleInput}
            on:focus={onMobileInputFocus}
            placeholder="Titel in der Callout-Zeile…"
          />
        </label>
      {/if}

      {#if isWandernMode}
        <WandernComposerFields
          titel={wandernTitel || calloutTitle}
          kurz={wandernKurz}
          beschreibung={wandernBeschreibung}
          track={wandernTrack}
          photos={wandernPhotos}
          trackPickerOpen={wandernTrackPickerOpen}
          trackPickerLoading={wandernTrackPickerLoading}
          trackOptions={wandernTrackOptions}
          previewMarkdown={wandernPreviewMarkdown}
          showPreview={wandernShowPreview}
          maxPhotos={wandernLayout.maxPhotos ?? 3}
          onTitelChange={(v) => {
            wandernTitel = v;
            calloutTitle = v;
            markModified();
          }}
          onKurzChange={(v) => {
            wandernKurz = v;
            markModified();
          }}
          onBeschreibungChange={(v) => {
            wandernBeschreibung = v;
            markModified();
          }}
          onRemovePhoto={onWandernRemovePhoto}
          onAddPhotoClick={onWandernAddPhotoClick}
          onPickTrackClick={onWandernPickTrackClick}
          onTrackOptionPick={onWandernTrackOptionPick}
          onClearTrackClick={onWandernClearTrackClick}
          onTogglePreview={() => {
            wandernShowPreview = !wandernShowPreview;
          }}
          onFocus={onMobileInputFocus}
        />
      {:else}
      <ul class="udn-composerEntries">
        {#each entries as entry (entry.id)}
          <li class="udn-outlineEntry udn-composerEntry">
            <input
              type="text"
              class="{dk.input} udn-timeBubble udn-timeBubbleInput"
              value={entry.time}
              placeholder="HH:mm"
              inputmode="numeric"
              aria-label="Zeit"
              on:input={(ev) => onEntryTimeInput(entry.id, ev)}
              on:focus={onMobileInputFocus}
            />
            <JournalBodyInput
              {app}
              value={entry.body}
              className="udn-timelineEntryEdit udn-composerEntryInput"
              sourcePath={filePath}
              onInput={(body) => onEntryBodyInput(entry.id, body)}
              onFocus={onMobileInputFocus}
              onOpenWikiLink={openComposerWikiLink}
            />
            <button
              type="button"
              class="udn-composerEntryRemove"
              aria-label="Eintrag entfernen"
              on:click={() => removeEntry(entry.id)}
            >×</button>
          </li>
        {/each}
        {#if entries.length === 0}
          <li class="udn-composerEntry udn-composerEntry--empty">
            {isMobile ? "Keine Einträge — Vorlage oder Eingabe unten." : "Noch keine Einträge — Vorlage wählen oder unten eingeben."}
          </li>
        {/if}
      </ul>

      {#if !isMobile}
        <div class="udn-composerAddRow">
          <input
            type="text"
            class="{dk.input} udn-timeBubble udn-timeBubbleInput"
            bind:value={newEntryTime}
            placeholder="HH:mm"
            inputmode="numeric"
            aria-label="Zeit für neuen Eintrag"
            on:focus={onMobileInputFocus}
          />
          <input
            type="text"
            class="{dk.input} udn-composerAddInput"
            placeholder="Neuer Eintrag (Enter)"
            bind:value={newEntryText}
            use:wikiLinkSuggest={{ app, sourcePath: filePath, onValueChange: applyNewEntryWikiLink }}
            on:keydown={onNewEntryKeydown}
            on:focus={onMobileInputFocus}
          />
          <button type="button" class={dk.btn} on:click={addFreeEntry} disabled={!newEntryText.trim()}>+</button>
        </div>
      {/if}
      {/if}
    </section>
  {/if}

  {#if !loading && !loadError && isMobile && !isWandernMode}
    <div class="udn-composerMobileDock" bind:this={mobileDock}>
      <div class="udn-composerAddRow udn-composerAddRow--pinned">
        <input
          type="text"
          class="{dk.input} udn-timeBubble udn-timeBubbleInput"
          bind:value={newEntryTime}
          placeholder="HH:mm"
          inputmode="numeric"
          aria-label="Zeit für neuen Eintrag"
          on:focus={onMobileInputFocus}
        />
        <input
          type="text"
          bind:this={addInput}
          class="{dk.input} udn-composerAddInput"
          placeholder="Neuer Eintrag"
          enterkeyhint="done"
          bind:value={newEntryText}
          use:wikiLinkSuggest={{ app, sourcePath: filePath, onValueChange: applyNewEntryWikiLink }}
          on:keydown={onNewEntryKeydown}
          on:focus={onMobileInputFocus}
        />
        <button
          type="button"
          class={dk.btnPrimary}
          on:mousedown|preventDefault
          on:click={addFreeEntry}
          disabled={!newEntryText.trim()}
          aria-label="Eintrag hinzufügen"
        >+</button>
      </div>
      <footer class="udn-composerFoot udn-composerFoot--mobile">
        <button type="button" class={dk.btn} on:click={openInEditor} disabled={loading}>Notiz</button>
        <button type="button" class={dk.btnPrimary} on:click={save} disabled={loading || saving}>
          {saving ? "…" : "Speichern"}
        </button>
      </footer>
    </div>
  {/if}

  {#if !loading && !loadError && isMobile && isWandernMode}
    <footer class="udn-composerFoot udn-composerFoot--mobile udn-composerFoot--wandern">
      <button type="button" class={dk.btn} on:click={openInEditor} disabled={loading}>Notiz</button>
      <button type="button" class={dk.btnPrimary} on:click={save} disabled={loading || saving}>
        {saving ? "…" : "Speichern"}
      </button>
    </footer>
  {/if}

  {#if !isMobile}
    <footer class="udn-composerFoot">
      <button type="button" class={dk.btn} on:click={onClose}>Schließen</button>
      <button type="button" class={dk.btn} on:click={openInEditor} disabled={loading}>In Notiz öffnen</button>
      <button type="button" class={dk.btnPrimary} on:click={save} disabled={loading || saving}>
        {saving ? "Speichern…" : "Speichern"}
      </button>
    </footer>
  {/if}
</div>
