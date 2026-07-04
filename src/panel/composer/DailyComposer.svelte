<script lang="ts">
  import { onMount, onDestroy, afterUpdate, tick } from "svelte";
  import type { App } from "obsidian";
  import { Menu, Notice, setIcon, TFile } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import type { DailyNoteFallbackSettings, TagebuchVerweiseSettings, CalendarSyncSettings, ComposerTemplatesSettings, TracksSettings, WandernLayoutSettings, FeedDetailLayoutSettings } from "../../settings";
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
  import { persistCalendarLinkOverrides } from "../../notes/calendarLinkOverrides";
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
  import { importJournalPhoto, maxPhotosForHeading } from "../../notes/photoImport";
  import {
    applyKeyboardInset,
    estimateKeyboardInset,
    observeDockHeight,
    scrollInputIntoView,
  } from "./mobileViewport";
  import WandernComposerFields from "./WandernComposerFields.svelte";
  import FeedDetailComposerFields from "./FeedDetailComposerFields.svelte";
  import SonstigesComposerFields from "./SonstigesComposerFields.svelte";
  import PhotoCollageField from "./PhotoCollageField.svelte";
  import { journalProfileForHeading } from "../../notes/journalProfiles";
  import type { FeedProfile } from "../../notes/feedMetadata";
  import { feedProfileLabel } from "../../notes/feedMetadata";
  import { generateEntryId } from "../../notes/journalEntryMeta";
  import { groupFieldLabel, groupFieldPlaceholder, loadRecentGroupLabels } from "../../notes/journalEntryGroups";
  import ProfileBubble from "../ProfileBubble.svelte";
  import ReisenComposerFields from "./ReisenComposerFields.svelte";
  import {
    loadFeedDetailComposerData,
    saveFeedDetailComposerState,
  } from "../../notes/feedDetailComposer";
  import { syncReisenSupplements, type ReisenSortOrder } from "../../notes/reisenComposer";
  import { withOperationTimeout } from "../../notes/vaultProcess";
  import { loadSonstigesComposerData, saveSonstigesComposerState } from "../../notes/sonstigesComposer";
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
  export let calendarLinkOverrides: Record<string, string> = DEFAULT_SETTINGS.calendarLinkOverrides;
  export let composerTemplates: ComposerTemplatesSettings = DEFAULT_SETTINGS.composerTemplates;
  export let tracksSettings: TracksSettings = DEFAULT_SETTINGS.tracks;
  export let wandernLayout: WandernLayoutSettings = DEFAULT_SETTINGS.wandernLayout;
  export let feedDetailLayout: FeedDetailLayoutSettings = DEFAULT_SETTINGS.feedDetailLayout;
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
  export let initialFocusEntryLine: number | null = null;
  export let initialFocusEntryId: string | null = null;

  const TAGEBUCH_HEADING = "Tagebuch";
  const PROFILE_MENU_IDS: FeedProfile[] = ["reisen", "wandern", "heizung", "lueftung", "sonstiges"];

  let currentDate = normalizeLocalDay(date);
  let activeHeading = TAGEBUCH_HEADING;
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
  let mobileFoot: HTMLDivElement;
  let addInput: HTMLInputElement;
  let detachDockObserver: (() => void) | null = null;
  let observedDockEl: HTMLElement | null = null;
  let loadGeneration = 0;
  let composerFile: TFile | null = null;
  let reiseSortOrder: Record<string, ReisenSortOrder> = {};
  let reiseGroupSuggestions: string[] = [];
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
  let feedDetailText = "";
  let feedDetailLinks = "";
  let feedDetailDetail = "";
  let feedDetailPhotos: string[] = [];
  let sonstigesDetail = "";
  let sonstigesFeedKurz = "";
  let listPhotos: string[] = [];
  let pendingComposerPhoto = false;
  let expandedEntryId: string | null = null;
  let landscapeMobile = false;
  let landscapeMq: MediaQueryList | null = null;
  let groupSuggestions: string[] = [];

  function onLandscapeChange() {
    landscapeMobile = isMobile && (landscapeMq?.matches ?? false);
  }

  $: activeProfile = journalProfileForHeading(activeHeading);
  $: isWandernMode = false;
  $: isSonstigesMode = false;
  $: isFeedDetailMode = false;
  $: isSpecialFormMode = false;
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

  $: chips = chipsForHeading(TAGEBUCH_HEADING, entryPrefixes);
  $: bulkTemplates = templatesForHeading(TAGEBUCH_HEADING, composerTemplates);
  $: prefixMenuEnabled = chips.length > 0 || bulkTemplates.length > 0 || !!onInsertWeather;
  $: dateLabel = formatDayBubbleLabel(
    `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`,
  );
  $: weekdayShort = currentDate.toLocaleDateString("de-DE", { weekday: "short" });

  onMount(() => {
    if (isMobile && typeof matchMedia !== "undefined") {
      landscapeMq = matchMedia("(orientation: landscape)");
      onLandscapeChange();
      landscapeMq.addEventListener("change", onLandscapeChange);
    }
    void reload();
    updateNavButtons();
  });

  onDestroy(() => {
    landscapeMq?.removeEventListener("change", onLandscapeChange);
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
        void import("../../integrations/calendarAppointments")
          .then(({ syncCalendarAppointmentsIntoDailyNote }) =>
            syncCalendarAppointmentsIntoDailyNote(app, {
              date: currentDate,
              fallback,
              settings: calendarSync,
              oncePerSession: true,
            }),
          )
          .catch((syncErr) => {
            console.warn("Universal Daily Note: Kalender-Sync beim Composer-Laden", syncErr);
          });
      }
      const [state, headings] = await Promise.all([
        loadComposerState(app, currentDate, fallback, TAGEBUCH_HEADING),
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
      composerFile = state.file;
      entries = state.entries.map((e) => ({ ...e }));
      reiseSortOrder = { ...state.reisenSortOrders };
      calloutTitle = state.calloutTitle;
      listPhotos = [...state.photos];
      summary = state.summary;
      summaryTouched = Boolean(state.summary.trim());
      newEntryText = "";
      newEntryTime = currentTime();
      await focusInitialEntry();
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

  async function focusInitialEntry() {
    if (initialFocusEntryLine == null && !initialFocusEntryId) return;
    const target =
      (initialFocusEntryId
        ? entries.find((entry) => entry.entryId === initialFocusEntryId)
        : undefined) ??
      (initialFocusEntryLine != null
        ? entries.find((entry) => entry.line === initialFocusEntryLine)
        : undefined);
    if (!target) return;
    expandedEntryId = target.id;
    await tick();
    composerRoot
      ?.querySelector<HTMLElement>(`[data-composer-entry="${target.id}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function markModified() {
    modified = true;
  }

  function photoImportContext(photoIndex: number) {
    return {
      date: currentDate,
      calloutTitle: wandernTitel || calloutTitle || activeHeading,
      heading: activeHeading,
      photoIndex,
      attachmentsFolder,
      wandernLayout,
      feedDetailLayout,
    };
  }

  function currentMaxPhotos(): number {
    return maxPhotosForHeading(activeHeading, { wandernLayout, feedDetailLayout });
  }

  function movePhotoAtIndex(photos: string[], index: number, delta: number): string[] {
    const target = index + delta;
    if (target < 0 || target >= photos.length) return photos;
    const next = [...photos];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    return next;
  }

  async function importComposerPhoto(selectedFile: File | null) {
    if (!selectedFile) return;
    const maxPhotos = currentMaxPhotos();
    let photos: string[];
    if (isFeedDetailMode) photos = feedDetailPhotos;
    else if (isWandernMode) photos = wandernPhotos;
    else photos = listPhotos;

    if (photos.length >= maxPhotos) {
      new Notice(`Maximal ${maxPhotos} Fotos.`);
      return;
    }

    templateBusy = true;
    try {
      const path = await importJournalPhoto(app, selectedFile, photoImportContext(photos.length));
      if (isFeedDetailMode) feedDetailPhotos = [...feedDetailPhotos, path];
      else if (isWandernMode) wandernPhotos = [...wandernPhotos, path];
      else listPhotos = [...listPhotos, path];
      markModified();
      new Notice("Foto hinzugefügt.");
    } catch (e) {
      console.error("Universal Daily Note: Composer Foto", e);
      new Notice("Foto konnte nicht gespeichert werden.");
    } finally {
      templateBusy = false;
    }
  }

  function onComposerAddPhotoClick() {
    pendingTemplatePack = null;
    pendingBulkOptions = null;
    pendingWandernPhoto = false;
    pendingComposerPhoto = true;
    templateFileInput?.click();
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
    const entryId = generateEntryId();
    const text = composerEntryText({ time, body, entryId }).trim();
    return { id, line: -1, time, body, rawLine: `- ${text}`, entryId };
  }

  function updateEntry(
    id: string,
    patch: Partial<
      Pick<
        ComposerEntry,
        "time" | "body" | "profile" | "context" | "entryId" | "calloutId" | "supplementDetail"
      >
    >,
  ) {
    entries = entries.map((e) => {
      if (e.id !== id) return e;
      const next = { ...e, ...patch };
      if ((patch.profile !== undefined || patch.context !== undefined) && !next.entryId) {
        next.entryId = generateEntryId();
      }
      return next;
    });
    markModified();
    if (!summaryTouched) {
      summary = suggestSummaryFromEntries(entries.map(composerEntryText));
    }
  }

  function openEntryProfileMenu(entry: ComposerEntry, ev: MouseEvent) {
    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle("Kein Profil");
      item.setChecked(!entry.profile || entry.profile === "tagebuch");
      item.onClick(() => {
        updateEntry(entry.id, { profile: undefined, context: "", supplementDetail: undefined });
        expandedEntryId = null;
      });
    });
    for (const profileId of PROFILE_MENU_IDS) {
      menu.addItem((item) => {
        item.setTitle(feedProfileLabel(profileId));
        item.setChecked(entry.profile === profileId);
        item.onClick(() => {
          updateEntry(entry.id, { profile: profileId, supplementDetail: profileId === "reisen" ? entry.supplementDetail : undefined });
          expandedEntryId = entry.id;
        });
      });
    }
    menu.showAtMouseEvent(ev);
  }

  $: expandedEntry = expandedEntryId ? entries.find((e) => e.id === expandedEntryId) ?? null : null;

  $: if (entries.some((e) => e.profile === "reisen")) {
    void loadRecentGroupLabels(app, fallback, tagebuchSettings, "reisen").then((labels) => {
      reiseGroupSuggestions = labels;
    });
  } else {
    reiseGroupSuggestions = [];
  }

  $: if (expandedEntry?.profile && expandedEntry.profile !== "reisen") {
    void loadRecentGroupLabels(app, fallback, tagebuchSettings, expandedEntry.profile).then((labels) => {
      groupSuggestions = labels;
    });
  } else {
    groupSuggestions = [];
  }

  function expandReisenEntry(entry: ComposerEntry) {
    if (entry.profile === "reisen") {
      expandedEntryId = entry.id;
    }
  }

  function onComposerEntryRowClick(entry: ComposerEntry, ev: MouseEvent) {
    if (entry.profile !== "reisen") return;
    const target = ev.target as HTMLElement;
    if (target.closest(".udn-composerEntryRemove, .udn-profileBubble")) return;
    expandedEntryId = entry.id;
  }

  function onComposerEntryFocus(entry: ComposerEntry, ev: FocusEvent) {
    expandReisenEntry(entry);
    onMobileInputFocus(ev);
  }

  function onComposerEntryBodyFocus(entry: ComposerEntry, ev: FocusEvent) {
    expandReisenEntry(entry);
    onMobileInputFocus(ev);
  }

  $: expandedGroupLabel = groupFieldLabel(expandedEntry?.profile);
  $: expandedGroupPlaceholder = groupFieldPlaceholder(expandedEntry?.profile);

  function onEntryContextInput(entryId: string, ev: Event) {
    updateEntry(entryId, { context: (ev.currentTarget as HTMLInputElement).value });
  }

  function onEntryReiseChange(entryId: string, value: string) {
    updateEntry(entryId, { context: value });
  }

  function onEntrySupplementDetailChange(entryId: string, value: string) {
    updateEntry(entryId, { supplementDetail: value });
  }

  function reiseGroupCount(reise: string): number {
    const key = reise.trim();
    return entries.filter((e) => e.profile === "reisen" && (e.context?.trim() ?? "") === key).length;
  }

  function showReiseGroupHeader(entry: ComposerEntry, index: number): boolean {
    if (entry.profile !== "reisen") return false;
    const reise = entry.context?.trim() ?? "";
    if (reiseGroupCount(reise) < 2) return false;
    for (let i = 0; i < index; i++) {
      const other = entries[i];
      if (other?.profile === "reisen" && (other.context?.trim() ?? "") === reise) return false;
    }
    return true;
  }

  function toggleReiseSortOrder(reise: string) {
    const key = reise.trim();
    const current = reiseSortOrder[key] ?? "asc";
    reiseSortOrder = { ...reiseSortOrder, [key]: current === "asc" ? "desc" : "asc" };
    markModified();
  }

  function reiseSortLabel(reise: string): string {
    return (reiseSortOrder[reise.trim()] ?? "asc") === "asc" ? "Zeit ↑" : "Zeit ↓";
  }

  function onExpandedContextInput(ev: Event) {
    if (!expandedEntry) return;
    updateEntry(expandedEntry.id, { context: (ev.currentTarget as HTMLInputElement).value });
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

  function removeEntry(id: string) {
    entries = entries.filter((e) => e.id !== id);
    if (expandedEntryId === id) expandedEntryId = null;
    markModified();
    if (!summaryTouched) {
      summary = suggestSummaryFromEntries(entries.map(composerEntryText));
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

  function onWandernAddPhotoClick() {
    onComposerAddPhotoClick();
  }

  function onWandernRemovePhoto(index: number) {
    wandernPhotos = wandernPhotos.filter((_, i) => i !== index);
    markModified();
  }

  function onWandernMovePhotoUp(index: number) {
    wandernPhotos = movePhotoAtIndex(wandernPhotos, index, -1);
    markModified();
  }

  function onWandernMovePhotoDown(index: number) {
    wandernPhotos = movePhotoAtIndex(wandernPhotos, index, 1);
    markModified();
  }

  async function onTemplatePhotoSelected(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const selectedFile = input.files?.item(0) ?? null;
    const pack = pendingTemplatePack;
    const opts = pendingBulkOptions;
    const directPhoto = pendingComposerPhoto && !pack;
    pendingTemplatePack = null;
    pendingBulkOptions = null;
    pendingWandernPhoto = false;
    pendingComposerPhoto = false;

    try {
      if (directPhoto) {
        await importComposerPhoto(selectedFile);
        return;
      }

      if (!pack || !opts) return;

      templateBusy = true;
      try {
        if (selectedFile) {
          await importComposerPhoto(selectedFile);
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
            includePhoto: false,
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

  function onFeedDetailAddPhotoClick() {
    onComposerAddPhotoClick();
  }

  function onFeedDetailRemovePhoto(index: number) {
    feedDetailPhotos = feedDetailPhotos.filter((_, i) => i !== index);
    markModified();
  }

  function onFeedDetailMovePhotoUp(index: number) {
    feedDetailPhotos = movePhotoAtIndex(feedDetailPhotos, index, -1);
    markModified();
  }

  function onFeedDetailMovePhotoDown(index: number) {
    feedDetailPhotos = movePhotoAtIndex(feedDetailPhotos, index, 1);
    markModified();
  }

  function onListRemovePhoto(index: number) {
    listPhotos = listPhotos.filter((_, i) => i !== index);
    markModified();
  }

  function onListMovePhotoUp(index: number) {
    listPhotos = movePhotoAtIndex(listPhotos, index, -1);
    markModified();
  }

  function onListMovePhotoDown(index: number) {
    listPhotos = movePhotoAtIndex(listPhotos, index, 1);
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
        filePath,
        linkOverrides: calendarLinkOverrides,
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

  function composerDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  async function syncCalendarAfterSave(savedDate: Date): Promise<void> {
    if (!calendarSync?.enabled) return;
    try {
      const { syncCalendarAppointmentsIntoDailyNote } = await import("../../integrations/calendarAppointments");
      await syncCalendarAppointmentsIntoDailyNote(app, {
        date: savedDate,
        fallback,
        settings: calendarSync,
        oncePerSession: true,
      });
    } catch (syncErr) {
      console.warn("Universal Daily Note: Kalender-Sync nach Speichern", syncErr);
    }
  }

  function resolveComposerFile(): TFile {
    if (composerFile) return composerFile;
    const cached = app.vault.getAbstractFileByPath(filePath);
    if (cached instanceof TFile) {
      composerFile = cached;
      return cached;
    }
    throw new Error("Daily-Note-Datei nicht gefunden.");
  }

  async function persistComposerSave(): Promise<void> {
    const file = resolveComposerFile();
    const dateKey = composerDateKey(currentDate);
    const entryTexts = collectEntryTextsForSave();
    await saveComposerState(
      app,
      {
        file,
        journalHeading: TAGEBUCH_HEADING,
        calloutTitle,
        summary,
        dateKey,
        photos: listPhotos,
      },
      entryTexts,
    );
    await syncReisenSupplements(app, file, entries, reiseSortOrder);
    await persistCalendarLinkOverrides(app, entries);
  }

  async function save() {
    if (saving || loading) return;
    if (!composerFile && !filePath) {
      new Notice("Notiz noch nicht geladen.");
      return;
    }
    saving = true;
    let saved = false;
    const savedDate = currentDate;
    try {
      console.info("Universal Daily Note: Composer save start", activeHeading, filePath);
      await withOperationTimeout(
        persistComposerSave(),
        12_000,
        "Speichern dauerte länger als 12 s.",
      );
      console.info("Universal Daily Note: Composer save done", activeHeading, filePath);
      saved = true;
      modified = false;
      onSaved(savedDate);
    } catch (e) {
      console.error("Universal Daily Note: Composer save", e);
      const message = e instanceof Error ? e.message : "";
      loadError = message || "Speichern fehlgeschlagen.";
      new Notice(loadError);
    } finally {
      saving = false;
    }
    if (saved) {
      onClose();
      void syncCalendarAfterSave(savedDate);
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

  function resolveFocusTarget(target: FocusEvent | HTMLElement): HTMLElement | null {
    if (target instanceof HTMLElement) return target;
    return (target.currentTarget as HTMLElement) ?? null;
  }

  function onMobileInputFocus(target: FocusEvent | HTMLElement) {
    if (!isMobile || !composerRoot) return;
    const el = resolveFocusTarget(target);
    if (!el) return;
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
    if (!isMobile || !composerRoot) return;
    const nextDock = mobileDock ?? null;
    if (nextDock === observedDockEl) return;
    detachDockObserver?.();
    observedDockEl = nextDock;
    detachDockObserver = nextDock ? observeDockHeight(nextDock, composerRoot) : null;
  });
</script>

<div
  class="udn-composer"
  class:udn-composer--mobile={isMobile}
  class:udn-composer--mobile-landscape={landscapeMobile}
  bind:this={composerRoot}
>
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
    <section class="udn-composerSection" class:udn-composerSplit={landscapeMobile}>
      {#if isMobile && !landscapeMobile}
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

      <div class="udn-composerSplitList">
      <PhotoCollageField
        {app}
        photos={listPhotos}
        maxPhotos={currentMaxPhotos()}
        onAddPhotoClick={onComposerAddPhotoClick}
        onRemovePhoto={onListRemovePhoto}
        onMovePhotoUp={onListMovePhotoUp}
        onMovePhotoDown={onListMovePhotoDown}
      />
      <ul class="udn-composerEntries">
        {#each entries as entry, entryIndex (entry.id)}
          {#if showReiseGroupHeader(entry, entryIndex)}
            {@const reiseName = entry.context?.trim() || "Reise"}
            <li class="udn-composerReiseGroupHead">
              <span class="udn-composerReiseGroupLabel">Reise: {reiseName}</span>
              <button
                type="button"
                class={dk.btn}
                on:click={() => toggleReiseSortOrder(reiseName)}
              >
                {reiseSortLabel(reiseName)}
              </button>
            </li>
          {/if}
          <li
            class="udn-outlineEntry udn-composerEntry"
            class:udn-composerEntry--expanded={expandedEntryId === entry.id}
            class:udn-composerEntry--reisen={entry.profile === "reisen"}
            data-composer-entry={entry.id}
            on:click={(ev) => onComposerEntryRowClick(entry, ev)}
          >
            <input
              type="text"
              class="{dk.input} udn-timeBubble udn-timeBubbleInput"
              value={entry.time}
              placeholder="HH:mm"
              aria-label="Zeit"
              on:input={(ev) => onEntryTimeInput(entry.id, ev)}
              on:focus={(ev) => onComposerEntryFocus(entry, ev)}
            />
            <ProfileBubble
              profile={entry.profile}
              title={entry.profile ? feedProfileLabel(entry.profile) : "Profil zuweisen"}
              onClick={(ev) => openEntryProfileMenu(entry, ev)}
            />
            <JournalBodyInput
              {app}
              value={entry.body}
              className="udn-timelineEntryEdit udn-composerEntryInput"
              sourcePath={filePath}
              feedProfile={entry.profile}
              linkBubbles={Boolean(entry.calendarId) || /\[\[[^\]|]+\]\]/.test(entry.body)}
              onInput={(body) => onEntryBodyInput(entry.id, body)}
              onFocus={(ev) => onComposerEntryBodyFocus(entry, ev)}
              onOpenWikiLink={openComposerWikiLink}
            />
            <button
              type="button"
              class="udn-composerEntryRemove"
              aria-label="Eintrag entfernen"
              on:click={() => removeEntry(entry.id)}
            >×</button>
            {#if expandedEntryId === entry.id && entry.profile === "reisen" && !landscapeMobile}
              <div class="udn-composerEntryExpand udn-composerEntryExpand--reisen">
                <ReisenComposerFields
                  reise={entry.context ?? ""}
                  detail={entry.supplementDetail ?? ""}
                  reiseOptions={reiseGroupSuggestions}
                  onReiseChange={(value) => onEntryReiseChange(entry.id, value)}
                  onDetailChange={(value) => onEntrySupplementDetailChange(entry.id, value)}
                  onFocus={onMobileInputFocus}
                />
              </div>
            {:else if expandedEntryId === entry.id && entry.profile && !landscapeMobile}
              <div class="udn-composerEntryExpand">
                <label class="udn-composerExpandField">
                  <span class="udn-composerSummaryLabel">{groupFieldLabel(entry.profile)}</span>
                  <input
                    type="text"
                    class="{dk.input} udn-composerSummaryInput"
                    list={entry.profile ? `udn-group-${entry.profile}-${entry.id}` : undefined}
                    value={entry.context ?? ""}
                    placeholder={groupFieldPlaceholder(entry.profile)}
                    on:input={(ev) => onEntryContextInput(entry.id, ev)}
                    on:focus={onMobileInputFocus}
                  />
                  {#if entry.profile}
                    <datalist id="udn-group-{entry.profile}-{entry.id}">
                      {#each groupSuggestions as label (label)}
                        <option value={label}></option>
                      {/each}
                    </datalist>
                  {/if}
                </label>
              </div>
            {/if}
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
      </div>

      {#if landscapeMobile && expandedEntry?.profile === "reisen"}
        <div class="udn-composerSplitDetail">
          <p class="udn-composerSplitDetailTitle">{feedProfileLabel(expandedEntry.profile)}</p>
          <ReisenComposerFields
            reise={expandedEntry.context ?? ""}
            detail={expandedEntry.supplementDetail ?? ""}
            reiseOptions={reiseGroupSuggestions}
            onReiseChange={(value) => onEntryReiseChange(expandedEntry.id, value)}
            onDetailChange={(value) => onEntrySupplementDetailChange(expandedEntry.id, value)}
            onFocus={onMobileInputFocus}
          />
        </div>
      {:else if landscapeMobile && expandedEntry?.profile}
        <div class="udn-composerSplitDetail">
          <p class="udn-composerSplitDetailTitle">{feedProfileLabel(expandedEntry.profile)}</p>
          <label class="udn-composerExpandField">
            <span class="udn-composerSummaryLabel">{expandedGroupLabel}</span>
            <input
              type="text"
              class="{dk.input} udn-composerSummaryInput"
              list="udn-group-landscape"
              value={expandedEntry.context ?? ""}
              placeholder={expandedGroupPlaceholder}
              on:input={onExpandedContextInput}
              on:focus={onMobileInputFocus}
            />
            <datalist id="udn-group-landscape">
              {#each groupSuggestions as label (label)}
                <option value={label}></option>
              {/each}
            </datalist>
          </label>
        </div>
      {/if}
    </section>
  {/if}

  {#if !loading && !loadError && isMobile}
    <div class="udn-composerMobileDock" bind:this={mobileDock}>
      <div class="udn-composerAddRow udn-composerAddRow--pinned">
        <input
          type="text"
          class="{dk.input} udn-timeBubble udn-timeBubbleInput"
          bind:value={newEntryTime}
          placeholder="HH:mm"
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

  {#if !loading && !loadError && isMobile && isSpecialFormMode}
    <div class="udn-composerMobileFoot" bind:this={mobileFoot}>
      <footer class="udn-composerFoot udn-composerFoot--mobile udn-composerFoot--wandern">
        <button type="button" class={dk.btn} on:click={openInEditor} disabled={loading}>Notiz</button>
        <button type="button" class={dk.btnPrimary} on:click={save} disabled={loading || saving}>
          {saving ? "…" : "Speichern"}
        </button>
      </footer>
    </div>
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
