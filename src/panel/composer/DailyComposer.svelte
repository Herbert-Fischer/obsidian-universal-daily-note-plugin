<script lang="ts">
  import { onMount, onDestroy, afterUpdate, tick } from "svelte";
  import type { App } from "obsidian";
  import { Menu, Notice, setIcon, TFile } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import type { DailyNoteFallbackSettings, TagebuchVerweiseSettings, CalendarSyncSettings, ComposerTemplatesSettings, ComposerGroupLabelListSettings, TracksSettings, WandernLayoutSettings, FeedDetailLayoutSettings } from "../../settings";
  import { DEFAULT_SETTINGS } from "../../settings";
  import { addLocalDays, formatTimeLocal, normalizeLocalDay } from "../dateUtils";
  import { formatDayBubbleLabel } from "../formatDayBubble";
  import {
    buildChipEntryText,
    chipsForHeading,
    composerEntryText,
    dedupeSupplementProfileEntries,
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
  import { journalProfileForHeading, journalProfileById } from "../../notes/journalProfiles";
  import type { FeedProfile } from "../../notes/feedMetadata";
  import { feedProfileLabel } from "../../notes/feedMetadata";
  import { generateEntryId } from "../../notes/journalEntryMeta";
  import { groupFieldLabel, groupFieldPlaceholder, loadRecentGroupLabels, mergeGroupLabelSuggestions } from "../../notes/journalEntryGroups";
  import ProfileBubble from "../ProfileBubble.svelte";
  import ReisenComposerFields from "./ReisenComposerFields.svelte";
  import LueftungComposerFields from "./LueftungComposerFields.svelte";
  import HeizungComposerFields from "./HeizungComposerFields.svelte";
  import GedankenComposerFields from "./GedankenComposerFields.svelte";
  import { pickVaultImageFile } from "./pickVaultImageFile";
  import {
    loadFeedDetailComposerData,
    saveFeedDetailComposerState,
  } from "../../notes/feedDetailComposer";
  import { syncReisenSupplements, type ReisenSortOrder } from "../../notes/reisenComposer";
  import { syncLueftungSupplements, lueftungCalloutTitle } from "../../notes/lueftungComposer";
  import { syncHeizungSupplements, heizungCalloutTitle } from "../../notes/heizungComposer";
  import { syncGedankenSupplements } from "../../notes/gedankenComposer";
  import { syncSpaziergangSupplements, spaziergangCalloutTitle } from "../../notes/spaziergangComposer";
  import { syncWandernSupplements, wandernCalloutTitle } from "../../notes/wandernComposer";
  import { withOperationTimeout, suppressVaultMetadataNotify, notifyVaultFileChanged } from "../../notes/vaultProcess";
  import { markComposerSaved, traceComposerSave } from "../../notes/composerSaveTrace";
  import {
    syncSonstigesSupplements,
    SONSTIGES_HEADING,
  } from "../../notes/sonstigesComposer";
  import {
    applyWandernBulkFields,
    loadWandernComposerData,
    renderWandernTemplate,
    saveWandernComposerState,
  } from "../../notes/wandernLayout";
  import { renderSpaziergangTemplate } from "../../notes/spaziergangLayout";
  import { reverseGeocode, getCurrentPosition } from "../../weather/openMeteo";
  import {
    clearComposerDraft,
    peekComposerDraft,
    saveComposerDraft,
  } from "./composerDraftCache";

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
  export let composerGroupLabels: Partial<Record<FeedProfile, ComposerGroupLabelListSettings>> =
    DEFAULT_SETTINGS.composerGroupLabels;
  export let tracksSettings: TracksSettings = DEFAULT_SETTINGS.tracks;
  export let wandernLayout: WandernLayoutSettings = DEFAULT_SETTINGS.wandernLayout;
  export let spaziergangLayout: WandernLayoutSettings = DEFAULT_SETTINGS.spaziergangLayout;
  export let feedDetailLayout: FeedDetailLayoutSettings = DEFAULT_SETTINGS.feedDetailLayout;
  export let attachmentsFolder = DEFAULT_SETTINGS.quickCapture.attachmentsFolder;
  export let weatherLastLocation = "";
  export let onPersistSideEffects: (patch: {
    lastLocation?: string;
    lastTripLabel?: string;
    composerGroupLabels?: Partial<Record<FeedProfile, ComposerGroupLabelListSettings>>;
  }) => void = () => {};
  export let timeFormat = "HH:mm";
  export let onClose: () => void = () => {};
  export let onRegisterCloseGuard: (guard: () => boolean) => void = () => {};
  export let onSaved: (date: Date) => void = () => {};
  export let onDateChange: (d: Date) => void = () => {};
  export let onHeadingChange: (heading: string) => void = () => {};
  export let isMobile = false;
  export let onInsertWeather: () => Promise<boolean> = async () => false;
  export let initialFocusEntryLine: number | null = null;
  export let initialFocusEntryId: string | null = null;

  const TAGEBUCH_HEADING = "Tagebuch";
  const PROFILE_MENU_IDS: FeedProfile[] = [
    "reisen",
    "wandern",
    "spaziergang",
    "heizung",
    "lueftung",
    "gedanken",
    "sonstiges",
  ];
  const SUPPLEMENT_PROFILES = new Set<FeedProfile>(["reisen", "lueftung", "heizung", "gedanken", "sonstiges"]);

  function entryUsesWandernFields(profile: FeedProfile | undefined): boolean {
    return profile === "wandern" || profile === "spaziergang";
  }

  function isWalkProfile(profile: FeedProfile | undefined): boolean {
    return entryUsesWandernFields(profile);
  }

  function showReiseForEntry(entry: Pick<ComposerEntry, "profile" | "reiseAssignment">): boolean {
    if (isWalkProfile(entry.profile)) return true;
    if (entry.profile !== "sonstiges") return false;
    return hasReisenEntries || Boolean(entry.reiseAssignment?.trim());
  }

  function entryExpandsOnFocus(profile: FeedProfile | undefined): boolean {
    return entryUsesSupplementFields(profile) || entryUsesWandernFields(profile);
  }

  function trackMatchFromPath(path: string | undefined): TrackMatch | null {
    const safe = path?.trim() ?? "";
    if (!safe) return null;
    return {
      path: safe,
      name: safe.split("/").pop() ?? safe,
      distanceKm: null,
      durationSec: null,
      startLabel: null,
      endLabel: null,
    };
  }

  function entryUsesSupplementFields(profile: FeedProfile | undefined): boolean {
    return profile != null && SUPPLEMENT_PROFILES.has(profile);
  }

  let currentDate = normalizeLocalDay(date);
  let activeHeading = initialJournalHeading?.trim() || TAGEBUCH_HEADING;
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
  let wartungGroupSuggestions: string[] = [];
  let vorfallGroupSuggestions: string[] = [];
  let themaGroupSuggestions: string[] = [];
  let weatherBusy = false;
  let templateBusy = false;
  let templateFileInput: HTMLInputElement;
  let pendingTemplatePack: ComposerTemplatePack | null = null;
  let pendingBulkOptions: { onlyMissing: boolean; selectedTrack: TrackMatch | null } | null = null;
  let pendingWandernPhoto = false;
  let pendingWandernEntryId: string | null = null;
  let wandernTitel = "";
  let wandernKurz = "";
  let wandernBeschreibung = "";
  let wandernTrack: TrackMatch | null = null;
  let wandernPhotos: string[] = [];
  let wandernShowPreview = false;
  let wandernTrackPickerEntryId: string | null = null;
  let wandernTrackPickerOpen = false;
  let wandernTrackPickerLoading = false;
  let wandernTrackOptions: TrackPickOption[] = [];
  let feedDetailText = "";
  let feedDetailLinks = "";
  let feedDetailDetail = "";
  let feedDetailPhotos: string[] = [];
  let listPhotos: string[] = [];
  let pendingComposerPhoto = false;
  let pendingSupplementEntryId: string | null = null;
  let expandedEntryId: string | null = null;
  let landscapeMobile = false;
  let landscapeMq: MediaQueryList | null = null;
  let groupSuggestions: string[] = [];
  const groupLabelsByProfile: Partial<Record<FeedProfile, string[]>> = {};
  const groupLabelsInflight: Partial<Record<FeedProfile, Promise<string[]>>> = {};
  let lastGroupProfileSignature = "";
  let summaryDebounce: ReturnType<typeof setTimeout> | null = null;
  let draftDebounce: ReturnType<typeof setTimeout> | null = null;

  function scheduleSummaryFromEntries(): void {
    if (summaryTouched) return;
    if (summaryDebounce) clearTimeout(summaryDebounce);
    summaryDebounce = setTimeout(() => {
      summaryDebounce = null;
      summary = suggestSummaryFromEntries(entries.map(composerEntryText));
    }, 250);
  }

  function flushPendingSummary(): void {
    if (summaryDebounce) {
      clearTimeout(summaryDebounce);
      summaryDebounce = null;
      if (!summaryTouched) {
        summary = suggestSummaryFromEntries(entries.map(composerEntryText));
      }
    }
  }

  function entryProfileSignature(): string {
    const parts = new Set<string>();
    for (const entry of entries) {
      if (entry.profile) parts.add(entry.profile);
    }
    if (expandedEntryId) {
      const expanded = entries.find((entry) => entry.id === expandedEntryId);
      if (
        expanded?.profile &&
        !entryUsesSupplementFields(expanded.profile) &&
        expanded.profile !== "wandern" &&
        expanded.profile !== "spaziergang"
      ) {
        parts.add(`expanded:${expanded.profile}`);
      }
    }
    return [...parts].sort().join("|");
  }

  function resetGroupLabelCache() {
    for (const key of Object.keys(groupLabelsByProfile) as FeedProfile[]) {
      delete groupLabelsByProfile[key];
    }
    for (const key of Object.keys(groupLabelsInflight) as FeedProfile[]) {
      delete groupLabelsInflight[key];
    }
    lastGroupProfileSignature = "";
    reiseGroupSuggestions = [];
    wartungGroupSuggestions = [];
    vorfallGroupSuggestions = [];
    themaGroupSuggestions = [];
    groupSuggestions = [];
  }

  async function ensureGroupLabels(profile: FeedProfile): Promise<string[]> {
    if (groupLabelsByProfile[profile]) {
      return mergeGroupLabelSuggestions(groupLabelsByProfile[profile]!, composerGroupLabels[profile]);
    }
    if (!groupLabelsInflight[profile]) {
      groupLabelsInflight[profile] = loadRecentGroupLabels(app, fallback, tagebuchSettings, profile).then(
        (labels) => {
          groupLabelsByProfile[profile] = labels;
          delete groupLabelsInflight[profile];
          return mergeGroupLabelSuggestions(labels, composerGroupLabels[profile]);
        },
      );
    }
    return groupLabelsInflight[profile]!;
  }

  function persistGroupLabels(profile: FeedProfile, patch: ComposerGroupLabelListSettings): void {
    composerGroupLabels = { ...composerGroupLabels, [profile]: patch };
    onPersistSideEffects({ composerGroupLabels });
    resetGroupLabelCache();
    void syncGroupSuggestions();
  }

  function addGroupLabel(profile: FeedProfile, label: string): void {
    const trimmed = label.trim();
    if (!trimmed) return;
    const current = composerGroupLabels[profile] ?? { extra: [], hidden: [] };
    const extra = [...new Set([...(current.extra ?? []), trimmed])];
    const hidden = (current.hidden ?? []).filter((h) => h.trim().toLowerCase() !== trimmed.toLowerCase());
    persistGroupLabels(profile, { extra, hidden });
  }

  function hideGroupLabel(profile: FeedProfile, label: string): void {
    const trimmed = label.trim();
    if (!trimmed) return;
    const current = composerGroupLabels[profile] ?? { extra: [], hidden: [] };
    const hidden = [...new Set([...(current.hidden ?? []), trimmed])];
    const extra = (current.extra ?? []).filter((h) => h.trim().toLowerCase() !== trimmed.toLowerCase());
    persistGroupLabels(profile, { extra, hidden });
  }

  // Backwards-friendly naming for existing callsites
  const addReiseGroupLabel = (label: string) => addGroupLabel("reisen", label);
  const hideReiseGroupLabel = (label: string) => hideGroupLabel("reisen", label);
  const addWartungGroupLabel = (label: string) => addGroupLabel("lueftung", label);
  const hideWartungGroupLabel = (label: string) => hideGroupLabel("lueftung", label);
  const addVorfallGroupLabel = (label: string) => addGroupLabel("heizung", label);
  const hideVorfallGroupLabel = (label: string) => hideGroupLabel("heizung", label);
  const addThemaGroupLabel = (label: string) => addGroupLabel("gedanken", label);
  const hideThemaGroupLabel = (label: string) => hideGroupLabel("gedanken", label);

  async function syncGroupSuggestions() {
    const needs = new Set<FeedProfile>();
    for (const entry of entries) {
      if (
        entry.profile === "reisen" ||
        entry.profile === "lueftung" ||
        entry.profile === "heizung" ||
        entry.profile === "gedanken" ||
        entry.profile === "wandern" ||
        entry.profile === "spaziergang"
      ) {
        needs.add(entry.profile);
      }
    }
    const expanded = expandedEntryId ? entries.find((entry) => entry.id === expandedEntryId) : null;
    if (
      expanded?.profile &&
      !entryUsesSupplementFields(expanded.profile) &&
      !isWalkProfile(expanded.profile)
    ) {
      needs.add(expanded.profile);
    }
    if (expanded?.profile === "wandern" || expanded?.profile === "spaziergang") {
      needs.add("reisen");
    }
    if (entries.some((e) => e.profile === "wandern" || e.profile === "spaziergang")) {
      needs.add("reisen");
    }
    if (
      entries.some((e) => e.profile === "sonstiges" && e.reiseAssignment?.trim()) ||
      (hasReisenEntries && entries.some((e) => e.profile === "sonstiges"))
    ) {
      needs.add("reisen");
    }

    reiseGroupSuggestions = needs.has("reisen") ? await ensureGroupLabels("reisen") : [];
    wartungGroupSuggestions = needs.has("lueftung") ? await ensureGroupLabels("lueftung") : [];
    vorfallGroupSuggestions = needs.has("heizung") ? await ensureGroupLabels("heizung") : [];
    themaGroupSuggestions = needs.has("gedanken") ? await ensureGroupLabels("gedanken") : [];

    if (needs.has("wandern")) {
      groupSuggestions = await ensureGroupLabels("wandern");
    } else if (
      expanded?.profile &&
      !entryUsesSupplementFields(expanded.profile) &&
      !isWalkProfile(expanded.profile)
    ) {
      groupSuggestions = await ensureGroupLabels(expanded.profile);
    } else {
      groupSuggestions = [];
    }
  }

  function maybeSyncGroupSuggestions() {
    const signature = entryProfileSignature();
    if (signature === lastGroupProfileSignature) return;
    lastGroupProfileSignature = signature;
    void syncGroupSuggestions();
  }

  function onLandscapeChange() {
    landscapeMobile = isMobile && (landscapeMq?.matches ?? false);
  }

  $: activeProfile = journalProfileForHeading(activeHeading);
  $: isWandernMode = false;
  $: isFeedDetailMode = false;
  $: isSpecialFormMode = isWandernMode || isFeedDetailMode;
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

  $: hasLueftungEntries = entries.some((e) => e.profile === "lueftung");
  $: hasHeizungEntries = entries.some((e) => e.profile === "heizung");
  $: hasGedankenEntries = entries.some((e) => e.profile === "gedanken");
  $: hasSonstigesEntries = entries.some((e) => e.profile === "sonstiges");
  $: hasWandernEntries = entries.some((e) => e.profile === "wandern");
  $: hasSpaziergangEntries = entries.some((e) => e.profile === "spaziergang");
  $: hasReisenEntries = entries.some(
    (e) =>
      e.profile === "reisen" ||
      (isWalkProfile(e.profile) && Boolean(e.reiseAssignment?.trim())),
  );
  $: hasSupplementPhotoEntries =
    hasLueftungEntries ||
    hasHeizungEntries ||
    hasWandernEntries ||
    hasSpaziergangEntries ||
    hasReisenEntries;
  $: wandernMaxPhotos = Math.max(
    1,
    wandernLayout.maxPhotos ?? journalProfileById("wandern")?.maxPhotos ?? 3,
  );
  $: spaziergangMaxPhotos = Math.max(
    1,
    spaziergangLayout.maxPhotos ?? journalProfileById("spaziergang")?.maxPhotos ?? 3,
  );
  $: lueftungMaxPhotos = Math.max(
    1,
    feedDetailLayout.maxPhotos ?? journalProfileById("lueftung")?.maxPhotos ?? 6,
  );
  $: heizungMaxPhotos = Math.max(
    1,
    feedDetailLayout.maxPhotos ?? journalProfileById("heizung")?.maxPhotos ?? 6,
  );
  $: reisenMaxPhotos = Math.max(
    1,
    feedDetailLayout.maxPhotos ?? journalProfileById("reisen")?.maxPhotos ?? 3,
  );
  $: chips = hasSonstigesEntries
    ? chipsForHeading(SONSTIGES_HEADING, entryPrefixes)
    : hasGedankenEntries
      ? chipsForHeading("Gedanken", entryPrefixes)
      : hasReisenEntries || activeHeading.trim().toLowerCase() === "reisen"
        ? chipsForHeading("Reisen", entryPrefixes)
        : chipsForHeading(TAGEBUCH_HEADING, entryPrefixes);
  $: bulkTemplates = templatesForHeading(activeHeading, composerTemplates);
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
    onRegisterCloseGuard(() => confirmDiscardChanges());
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && modified) {
        persistComposerDraft();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void reload();
    updateNavButtons();
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  });

  onDestroy(() => {
    landscapeMq?.removeEventListener("change", onLandscapeChange);
    detachDockObserver?.();
    if (draftDebounce) clearTimeout(draftDebounce);
  });

  function composerDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function snapshotComposerDraft() {
    return {
      dateKey: composerDateKey(currentDate),
      heading: activeHeading,
      entries: entries.map((entry) => ({ ...entry })),
      summary,
      calloutTitle,
      listPhotos: [...listPhotos],
      reiseSortOrder: { ...reiseSortOrder },
      summaryTouched,
      newEntryText,
      newEntryTime,
      wandernTitel,
    };
  }

  function persistComposerDraft() {
    if (!modified) return;
    saveComposerDraft(snapshotComposerDraft());
  }

  function scheduleComposerDraftSave() {
    if (draftDebounce) clearTimeout(draftDebounce);
    draftDebounce = setTimeout(() => {
      draftDebounce = null;
      persistComposerDraft();
    }, 400);
  }

  function applyComposerDraft(draftSnapshot: ReturnType<typeof snapshotComposerDraft>) {
    entries = draftSnapshot.entries.map((entry) => ({ ...entry }));
    summary = draftSnapshot.summary;
    calloutTitle = draftSnapshot.calloutTitle;
    listPhotos = [...draftSnapshot.listPhotos];
    reiseSortOrder = { ...draftSnapshot.reiseSortOrder };
    summaryTouched = draftSnapshot.summaryTouched;
    newEntryText = draftSnapshot.newEntryText;
    newEntryTime = draftSnapshot.newEntryTime;
    wandernTitel = draftSnapshot.wandernTitel;
    modified = true;
  }

  async function reload() {
    const generation = ++loadGeneration;
    loading = true;
    loadError = "";
    modified = false;
    resetGroupLabelCache();
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
      const restoredDraft = peekComposerDraft(composerDateKey(currentDate), activeHeading);
      if (restoredDraft) {
        applyComposerDraft(restoredDraft);
        new Notice("Composer-Entwurf wiederhergestellt.");
      } else {
        entries = state.entries.map((e) => ({ ...e }));
        reiseSortOrder = { ...state.reisenSortOrders };
        calloutTitle = state.calloutTitle;
        listPhotos = [...state.photos];
        summary = state.summary;
        summaryTouched = Boolean(state.summary.trim());
      }
      newEntryText = "";
      newEntryTime = currentTime();
      maybeSyncGroupSuggestions();
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
        ? entries.find(
            (entry) =>
              entry.line === initialFocusEntryLine || entry.id === `line-${initialFocusEntryLine}`,
          )
        : undefined);
    if (!target) return;
    expandedEntryId = target.id;
    await tick();
    const row = composerRoot?.querySelector<HTMLElement>(`[data-composer-entry="${target.id}"]`);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
    const focusEl = row?.querySelector<HTMLElement>(
      ".udn-composerEntryInput input, .udn-composerEntryInput textarea, .udn-timeBubbleInput",
    );
    focusEl?.focus();
  }

  function markModified() {
    modified = true;
    scheduleComposerDraftSave();
  }

  function photoImportContext(photoIndex: number, supplementEntry?: ComposerEntry) {
    const profile = supplementEntry?.profile;
    return {
      date: currentDate,
      calloutTitle: wandernTitel || calloutTitle || activeHeading,
      heading:
        profile === "lueftung"
          ? "Lüftung"
          : profile === "heizung"
            ? "Heizung"
            : profile === "wandern"
              ? "Wandern"
              : profile === "spaziergang"
                ? "Spaziergang"
                : activeHeading,
      photoIndex,
      attachmentsFolder,
      wandernLayout,
      feedDetailLayout,
      lueftungEntryTitle:
        profile === "lueftung" && supplementEntry ? lueftungCalloutTitle(supplementEntry) : undefined,
      heizungEntryTitle:
        profile === "heizung" && supplementEntry ? heizungCalloutTitle(supplementEntry) : undefined,
      wandernEntryTitle:
        profile === "wandern" && supplementEntry ? wandernCalloutTitle(supplementEntry) : undefined,
      spaziergangEntryTitle:
        profile === "spaziergang" && supplementEntry ? spaziergangCalloutTitle(supplementEntry) : undefined,
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

  async function importComposerPhoto(
    selectedFiles: File | FileList | null | undefined,
    supplementEntryId?: string | null,
  ) {
    if (!selectedFiles) return;
    const files = Array.from(selectedFiles instanceof FileList ? selectedFiles : [selectedFiles]).filter(Boolean);
    if (files.length === 0) return;

    let added = 0;
    for (const selectedFile of files) {
      const imported = await importOneComposerPhoto(selectedFile, supplementEntryId);
      if (imported) added++;
    }
    if (added === 1) new Notice("Foto hinzugefügt.");
    else if (added > 1) new Notice(`${added} Fotos hinzugefügt.`);
  }

  async function importOneComposerPhoto(
    selectedFile: File,
    supplementEntryId?: string | null,
  ): Promise<boolean> {
    const supplementEntry = supplementEntryId
      ? entries.find((e) => e.id === supplementEntryId)
      : undefined;

    if (supplementEntry?.profile === "lueftung") {
      const photos = supplementEntry.supplementPhotos ?? [];
      if (photos.length >= lueftungMaxPhotos) {
        new Notice(`Maximal ${lueftungMaxPhotos} Fotos.`);
        return false;
      }
      templateBusy = true;
      try {
        const path = await importJournalPhoto(
          app,
          selectedFile,
          photoImportContext(photos.length, supplementEntry),
        );
        updateEntry(supplementEntry.id, { supplementPhotos: [...photos, path] });
        markModified();
        return true;
      } catch (e) {
        console.error("Universal Daily Note: Composer Lüftung-Foto", e);
        new Notice("Foto konnte nicht gespeichert werden.");
        return false;
      } finally {
        templateBusy = false;
      }
    }

    if (supplementEntry?.profile === "heizung") {
      const photos = supplementEntry.supplementPhotos ?? [];
      if (photos.length >= heizungMaxPhotos) {
        new Notice(`Maximal ${heizungMaxPhotos} Fotos.`);
        return false;
      }
      templateBusy = true;
      try {
        const path = await importJournalPhoto(
          app,
          selectedFile,
          photoImportContext(photos.length, supplementEntry),
        );
        updateEntry(supplementEntry.id, { supplementPhotos: [...photos, path] });
        markModified();
        return true;
      } catch (e) {
        console.error("Universal Daily Note: Composer Heizung-Foto", e);
        new Notice("Foto konnte nicht gespeichert werden.");
        return false;
      } finally {
        templateBusy = false;
      }
    }

    if (supplementEntry?.profile === "reisen") {
      const photos = supplementEntry.supplementPhotos ?? [];
      if (photos.length >= reisenMaxPhotos) {
        new Notice(`Maximal ${reisenMaxPhotos} Fotos.`);
        return false;
      }
      templateBusy = true;
      try {
        const path = await importJournalPhoto(
          app,
          selectedFile,
          photoImportContext(photos.length, supplementEntry),
        );
        updateEntry(supplementEntry.id, { supplementPhotos: [...photos, path] });
        markModified();
        return true;
      } catch (e) {
        console.error("Universal Daily Note: Composer Reisen-Foto", e);
        new Notice("Foto konnte nicht gespeichert werden.");
        return false;
      } finally {
        templateBusy = false;
      }
    }

    if (supplementEntry?.profile === "wandern" || supplementEntry?.profile === "spaziergang") {
      const photos = supplementEntry.supplementPhotos ?? [];
      const maxPhotos =
        supplementEntry.profile === "spaziergang" ? spaziergangMaxPhotos : wandernMaxPhotos;
      if (photos.length >= maxPhotos) {
        new Notice(`Maximal ${maxPhotos} Fotos.`);
        return false;
      }
      templateBusy = true;
      try {
        const path = await importJournalPhoto(
          app,
          selectedFile,
          photoImportContext(photos.length, supplementEntry),
        );
        updateEntry(supplementEntry.id, { supplementPhotos: [...photos, path] });
        markModified();
        return true;
      } catch (e) {
        console.error("Universal Daily Note: Composer Spaziergang/Wandern-Foto", e);
        new Notice("Foto konnte nicht gespeichert werden.");
        return false;
      } finally {
        templateBusy = false;
      }
    }

    const maxPhotos = currentMaxPhotos();
    let photos: string[];
    if (isFeedDetailMode) photos = feedDetailPhotos;
    else if (isWandernMode) photos = wandernPhotos;
    else photos = listPhotos;

    if (photos.length >= maxPhotos) {
      new Notice(`Maximal ${maxPhotos} Fotos.`);
      return false;
    }

    templateBusy = true;
    try {
      const path = await importJournalPhoto(app, selectedFile, photoImportContext(photos.length));
      if (isFeedDetailMode) feedDetailPhotos = [...feedDetailPhotos, path];
      else if (isWandernMode) wandernPhotos = [...wandernPhotos, path];
      else listPhotos = [...listPhotos, path];
      markModified();
      return true;
    } catch (e) {
      console.error("Universal Daily Note: Composer Foto", e);
      new Notice("Foto konnte nicht gespeichert werden.");
      return false;
    } finally {
      templateBusy = false;
    }
  }

  function onComposerAddPhotoClick(supplementEntryId?: string) {
    pendingTemplatePack = null;
    pendingBulkOptions = null;
    pendingWandernPhoto = false;
    pendingComposerPhoto = true;
    pendingSupplementEntryId = supplementEntryId ?? null;
    if (templateFileInput) templateFileInput.multiple = true;
    templateFileInput?.click();
  }

  function defaultReiseAssignmentForNewEntry(): string {
    if (expandedEntry?.profile === "reisen" && expandedEntry.context?.trim()) {
      return expandedEntry.context.trim();
    }
    if (expandedEntry?.reiseAssignment?.trim()) {
      return expandedEntry.reiseAssignment.trim();
    }
    const reisenContexts = entries
      .filter((e) => e.profile === "reisen" && e.context?.trim())
      .map((e) => e.context!.trim());
    if (reisenContexts.length === 1) return reisenContexts[0]!;
    return "";
  }

  function addChipEntry(chip: ComposerChip) {
    const time = chip.defaultTime ?? currentTime();
    const { time: entryTime, body } = parseJournalEntryDisplay(buildChipEntryText(chip, time));
    const entry = makeNewEntry(entryTime ?? time, body);
    const template = chip.template.trim().toLowerCase();
    if (template.startsWith("wandern:")) {
      entry.profile = "wandern";
      const reise = defaultReiseAssignmentForNewEntry();
      if (reise) entry.reiseAssignment = reise;
      expandedEntryId = entry.id;
    } else if (template.startsWith("spaziergang:")) {
      entry.profile = "spaziergang";
      const reise = defaultReiseAssignmentForNewEntry();
      if (reise) entry.reiseAssignment = reise;
      expandedEntryId = entry.id;
    } else if (
      hasReisenEntries ||
      activeHeading.trim().toLowerCase() === "reisen"
    ) {
      const reisenTemplates = new Set([
        "abfahrt:",
        "etappe:",
        "highlight:",
        "ankunft:",
        "unterkunft:",
        "foto:",
      ]);
      if (reisenTemplates.has(template)) {
        entry.profile = "reisen";
      }
    }
    entries = [...entries, entry];
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
        "time" | "body" | "profile" | "context" | "entryId" | "calloutId" | "supplementDetail" | "supplementPhotos" | "supplementKurz" | "supplementTrackPath" | "reiseAssignment"
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
    if (patch.body !== undefined || patch.time !== undefined) {
      scheduleSummaryFromEntries();
    }
    if (patch.profile !== undefined || patch.context !== undefined) {
      maybeSyncGroupSuggestions();
    }
  }

  function openEntryProfileMenu(entry: ComposerEntry, ev: MouseEvent) {
    const menu = new Menu();
    menu.addItem((item) => {
      item.setTitle("Kein Profil");
      item.setChecked(!entry.profile || entry.profile === "tagebuch");
      item.onClick(() => {
        updateEntry(entry.id, {
          profile: undefined,
          context: "",
          reiseAssignment: undefined,
          supplementDetail: undefined,
          supplementPhotos: undefined,
          supplementKurz: undefined,
          supplementTrackPath: undefined,
        });
        expandedEntryId = null;
      });
    });
    for (const profileId of PROFILE_MENU_IDS) {
      menu.addItem((item) => {
        item.setTitle(feedProfileLabel(profileId));
        item.setChecked(entry.profile === profileId);
        item.onClick(() => {
          const next: Partial<ComposerEntry> = {
            profile: profileId,
            supplementDetail:
              entryUsesSupplementFields(profileId) || isWalkProfile(profileId)
                ? entry.supplementDetail
                : undefined,
            supplementPhotos:
              profileId === "lueftung" || profileId === "heizung" || isWalkProfile(profileId)
                ? entry.supplementPhotos
                : undefined,
            supplementKurz: isWalkProfile(profileId) ? entry.supplementKurz : undefined,
            supplementTrackPath: isWalkProfile(profileId) ? entry.supplementTrackPath : undefined,
            reiseAssignment:
              isWalkProfile(profileId) || profileId === "sonstiges" ? entry.reiseAssignment : undefined,
          };
          if (profileId === "reisen" && (isWalkProfile(entry.profile) || entry.profile === "sonstiges") && entry.reiseAssignment?.trim()) {
            next.context = entry.reiseAssignment.trim();
          } else if ((isWalkProfile(profileId) || profileId === "sonstiges") && entry.profile === "reisen" && entry.context?.trim()) {
            next.reiseAssignment = entry.context.trim();
          }
          updateEntry(entry.id, next);
          expandedEntryId = entry.id;
        });
      });
    }
    menu.showAtMouseEvent(ev);
  }

  $: expandedEntry = expandedEntryId ? entries.find((e) => e.id === expandedEntryId) ?? null : null;
  $: expandedEntryId, maybeSyncGroupSuggestions();

  async function scrollExpandedEntryIntoView(): Promise<void> {
    if (!isMobile || !expandedEntryId || !composerRoot) return;
    await tick();
    const row = composerRoot.querySelector<HTMLElement>(`[data-composer-entry="${expandedEntryId}"]`);
    if (!row) return;
    const expand = row.querySelector<HTMLElement>(".udn-composerEntryExpand");
    scrollInputIntoView(expand ?? row, composerRoot);
  }

  $: if (expandedEntryId) {
    void scrollExpandedEntryIntoView();
  }

  function expandSupplementEntry(entry: ComposerEntry) {
    if (entryExpandsOnFocus(entry.profile)) {
      expandedEntryId = entry.id;
    }
  }

  function onComposerEntryRowClick(entry: ComposerEntry, ev: MouseEvent) {
    if (!entryExpandsOnFocus(entry.profile)) return;
    const target = ev.target as HTMLElement;
    if (
      target.closest(
        ".udn-composerEntryRemove, .udn-profileBubble, .udn-composerEntryExpand, .udn-markdownDetailToolbar, .udn-markdownDetailField",
      )
    ) {
      return;
    }
    expandedEntryId = entry.id;
  }

  function onComposerEntryFocus(entry: ComposerEntry, ev: FocusEvent) {
    expandSupplementEntry(entry);
    onMobileInputFocus(ev);
  }

  function onComposerEntryBodyFocus(entry: ComposerEntry, ev: FocusEvent) {
    expandSupplementEntry(entry);
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

  function onEntryWartungChange(entryId: string, value: string) {
    updateEntry(entryId, { context: value });
  }

  function onEntryVorfallChange(entryId: string, value: string) {
    updateEntry(entryId, { context: value });
  }

  function onEntryThemaChange(entryId: string, value: string) {
    updateEntry(entryId, { context: value });
  }

  function onEntrySupplementDetailChange(entryId: string, value: string) {
    updateEntry(entryId, { supplementDetail: value });
  }

  function onEntryWandernReiseChange(entryId: string, value: string) {
    updateEntry(entryId, { reiseAssignment: value });
  }

  function onEntryLueftungPhotosChange(entryId: string, photos: string[]) {
    updateEntry(entryId, { supplementPhotos: photos });
  }

  function onLueftungAddPhotoClick(entryId: string) {
    onComposerAddPhotoClick(entryId);
  }

  async function onLueftungAddVaultPhotoClick(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    const photos = entry.supplementPhotos ?? [];
    if (photos.length >= lueftungMaxPhotos) {
      new Notice(`Maximal ${lueftungMaxPhotos} Fotos.`);
      return;
    }
    const path = await pickVaultImageFile(app);
    if (!path) return;
    updateEntry(entryId, { supplementPhotos: [...photos, path] });
    markModified();
    new Notice("Vault-Foto verknüpft — wird beim Speichern in Anhänge/Bilder verschoben.");
  }

  function onLueftungRemovePhoto(entryId: string, index: number) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    onEntryLueftungPhotosChange(
      entryId,
      (entry.supplementPhotos ?? []).filter((_, i) => i !== index),
    );
  }

  function onLueftungMovePhotoUp(entryId: string, index: number) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    onEntryLueftungPhotosChange(entryId, movePhotoAtIndex(entry.supplementPhotos ?? [], index, -1));
  }

  function onLueftungMovePhotoDown(entryId: string, index: number) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    onEntryLueftungPhotosChange(entryId, movePhotoAtIndex(entry.supplementPhotos ?? [], index, 1));
  }

  function onEntryHeizungPhotosChange(entryId: string, photos: string[]) {
    updateEntry(entryId, { supplementPhotos: photos });
  }

  function onEntryReisenPhotosChange(entryId: string, photos: string[]) {
    updateEntry(entryId, { supplementPhotos: photos });
  }

  function onReisenAddPhotoClick(entryId: string) {
    onComposerAddPhotoClick(entryId);
  }

  async function onReisenAddVaultPhotoClick(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    const photos = entry.supplementPhotos ?? [];
    if (photos.length >= reisenMaxPhotos) {
      new Notice(`Maximal ${reisenMaxPhotos} Fotos.`);
      return;
    }
    const path = await pickVaultImageFile(app);
    if (!path) return;
    updateEntry(entryId, { supplementPhotos: [...photos, path] });
    markModified();
    new Notice("Vault-Foto verknüpft — wird beim Speichern in Anhänge/Bilder verschoben.");
  }

  function onReisenRemovePhoto(entryId: string, index: number) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    onEntryReisenPhotosChange(
      entryId,
      (entry.supplementPhotos ?? []).filter((_, i) => i !== index),
    );
  }

  function onReisenMovePhotoUp(entryId: string, index: number) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    onEntryReisenPhotosChange(entryId, movePhotoAtIndex(entry.supplementPhotos ?? [], index, -1));
  }

  function onReisenMovePhotoDown(entryId: string, index: number) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    onEntryReisenPhotosChange(entryId, movePhotoAtIndex(entry.supplementPhotos ?? [], index, 1));
  }

  function onHeizungAddPhotoClick(entryId: string) {
    onComposerAddPhotoClick(entryId);
  }

  async function onHeizungAddVaultPhotoClick(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    const photos = entry.supplementPhotos ?? [];
    if (photos.length >= heizungMaxPhotos) {
      new Notice(`Maximal ${heizungMaxPhotos} Fotos.`);
      return;
    }
    const path = await pickVaultImageFile(app);
    if (!path) return;
    updateEntry(entryId, { supplementPhotos: [...photos, path] });
    markModified();
    new Notice("Vault-Foto verknüpft — wird beim Speichern in Anhänge/Bilder verschoben.");
  }

  function onHeizungRemovePhoto(entryId: string, index: number) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    onEntryHeizungPhotosChange(
      entryId,
      (entry.supplementPhotos ?? []).filter((_, i) => i !== index),
    );
  }

  function onHeizungMovePhotoUp(entryId: string, index: number) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    onEntryHeizungPhotosChange(entryId, movePhotoAtIndex(entry.supplementPhotos ?? [], index, -1));
  }

  function onHeizungMovePhotoDown(entryId: string, index: number) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    onEntryHeizungPhotosChange(entryId, movePhotoAtIndex(entry.supplementPhotos ?? [], index, 1));
  }


  function onEntryWandernTrackChange(entryId: string, track: TrackMatch | null) {
    updateEntry(entryId, { supplementTrackPath: track?.path ?? "" });
  }

  async function openWandernTrackPicker(entryId: string) {
    if (wandernTrackPickerEntryId === entryId) {
      wandernTrackPickerEntryId = null;
      return;
    }
    if (!tracksSettings.enabled) {
      new Notice("GPX-Tracks sind in den Einstellungen deaktiviert.");
      return;
    }

    wandernTrackPickerEntryId = entryId;
    wandernTrackPickerLoading = true;
    wandernTrackOptions = [];
    try {
      const dayTracks = await findTracksForDay(app, currentDate, tracksSettings);
      const allTracks = await findAllTracksInFolder(app, tracksSettings);
      const dayPaths = new Set(dayTracks.map((t) => t.path));
      const otherTracks = allTracks.filter((t) => !dayPaths.has(t.path));
      if (dayTracks.length === 0 && otherTracks.length === 0) {
        new Notice(`Keine GPX-Dateien in „${tracksSettings.folder}“ gefunden.`);
        wandernTrackPickerEntryId = null;
        return;
      }
      wandernTrackOptions = trackPickOptionsForDay(dayTracks, otherTracks);
    } catch (e) {
      console.error("Universal Daily Note: GPX-Tracks laden", e);
      new Notice("GPX-Tracks konnten nicht geladen werden.");
      wandernTrackPickerEntryId = null;
    } finally {
      wandernTrackPickerLoading = false;
    }
  }

  function wandernPreviewForEntry(entry: ComposerEntry): string {
    return renderWandernTemplate({
      titel: wandernCalloutTitle(entry),
      kurz: entry.supplementKurz ?? "",
      beschreibung: entry.supplementDetail ?? "",
      track: trackMatchFromPath(entry.supplementTrackPath),
      photos: entry.supplementPhotos ?? [],
      date: currentDate,
      layout: wandernLayout,
    });
  }

  function walkCalloutTitle(entry: ComposerEntry): string {
    return entry.profile === "spaziergang" ? spaziergangCalloutTitle(entry) : wandernCalloutTitle(entry);
  }

  function walkPreviewForEntry(entry: ComposerEntry): string {
    if (entry.profile === "spaziergang") {
      return renderSpaziergangTemplate({
        titel: spaziergangCalloutTitle(entry),
        kurz: entry.supplementKurz ?? "",
        beschreibung: entry.supplementDetail ?? "",
        track: trackMatchFromPath(entry.supplementTrackPath),
        photos: entry.supplementPhotos ?? [],
        date: currentDate,
        layout: spaziergangLayout,
      });
    }
    return wandernPreviewForEntry(entry);
  }

  function walkMaxPhotosForEntry(entry: ComposerEntry): number {
    return entry.profile === "spaziergang" ? spaziergangMaxPhotos : wandernMaxPhotos;
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

  function confirmDiscardChanges(): boolean {
    if (!modified) return true;
    if (!confirm("Ungespeicherte Änderungen verwerfen?")) return false;
    clearComposerDraft();
    return true;
  }

  async function shiftDate(delta: number) {
    if (!confirmDiscardChanges()) return;
    currentDate = addLocalDays(currentDate, delta);
    onDateChange(currentDate);
    await reload();
  }

  async function goToday() {
    if (!confirmDiscardChanges()) return;
    currentDate = normalizeLocalDay(new Date());
    onDateChange(currentDate);
    await reload();
  }

  async function selectHeading(heading: string) {
    if (heading.toLowerCase() === activeHeading.toLowerCase()) return;
    if (!confirmDiscardChanges()) return;
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
    const wandernTarget =
      expandedEntry?.profile === "wandern" ? expandedEntry : null;
    if (wandernTarget) {
      if (
        (wandernTarget.supplementKurz ||
          wandernTarget.supplementDetail ||
          wandernTarget.supplementTrackPath ||
          (wandernTarget.supplementPhotos?.length ?? 0) > 0) &&
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

    if (pack.actions?.includes("photo") && confirm(bulkPhotoConfirmMessage(wandernTarget ? "Wandern" : activeHeading))) {
      pendingTemplatePack = pack;
      pendingBulkOptions = { onlyMissing, selectedTrack };
      pendingWandernPhoto = Boolean(wandernTarget);
      pendingWandernEntryId = wandernTarget?.id ?? null;
      if (templateFileInput) templateFileInput.multiple = false;
      templateFileInput?.click();
      return;
    }

    if (wandernTarget) {
      await executeWandernBulkTemplateForEntry(pack, wandernTarget, { selectedTrack });
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
    const selectedFiles = input.files;
    const selectedFile = selectedFiles?.item(0) ?? null;
    const pack = pendingTemplatePack;
    const opts = pendingBulkOptions;
    const directPhoto = pendingComposerPhoto && !pack;
    const supplementEntryId = pendingSupplementEntryId;
    const wandernEntryId = pendingWandernEntryId;
    pendingTemplatePack = null;
    pendingBulkOptions = null;
    pendingWandernPhoto = false;
    pendingWandernEntryId = null;
    pendingComposerPhoto = false;
    pendingSupplementEntryId = null;

    try {
      if (directPhoto) {
        await importComposerPhoto(selectedFiles, supplementEntryId);
        return;
      }

      if (!pack || !opts) return;

      templateBusy = true;
      try {
        let photoPath: string | undefined;
        if (selectedFile) {
          if (wandernEntryId) {
            await importComposerPhoto(selectedFile, wandernEntryId);
            const entry = entries.find((e) => e.id === wandernEntryId);
            photoPath = entry?.supplementPhotos?.[(entry.supplementPhotos?.length ?? 1) - 1];
          } else {
            await importComposerPhoto(selectedFile);
          }
        }
        if (wandernEntryId) {
          const entry = entries.find((e) => e.id === wandernEntryId);
          if (entry) {
            await executeWandernBulkTemplateForEntry(pack, entry, {
              selectedTrack: opts.selectedTrack,
              photoPath,
            });
          }
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

  async function executeWandernBulkTemplateForEntry(
    pack: ComposerTemplatePack,
    entry: ComposerEntry,
    options: { selectedTrack: TrackMatch | null; photoPath?: string },
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
          titel: wandernCalloutTitle(entry),
          kurz: entry.supplementKurz ?? "",
          beschreibung: entry.supplementDetail ?? "",
          track: trackMatchFromPath(entry.supplementTrackPath),
          photos: entry.supplementPhotos ?? [],
        },
        {
          locationLabel,
          track: options.selectedTrack ?? trackMatchFromPath(entry.supplementTrackPath),
          photoPath: options.photoPath,
          maxPhotos: wandernMaxPhotos,
        },
      );
      updateEntry(entry.id, {
        context: updated.titel,
        supplementKurz: updated.kurz,
        supplementDetail: updated.beschreibung,
        supplementTrackPath: updated.track?.path ?? "",
        supplementPhotos: updated.photos,
      });
    } catch (e) {
      console.error("Universal Daily Note: Wandern-Vorlage", e);
    } finally {
      templateBusy = false;
    }
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

  async function syncCalendarAfterSave(savedDate: Date): Promise<void> {
    if (!calendarSync?.enabled) return;
    if (calendarSync.syncOnOutlineLoad) return;
    try {
      await traceComposerSave(app, "save:calendar-sync-start");
      const { syncCalendarAppointmentsIntoDailyNote } = await import("../../integrations/calendarAppointments");
      const added = await syncCalendarAppointmentsIntoDailyNote(app, {
        date: savedDate,
        fallback,
        settings: calendarSync,
        oncePerSession: true,
      });
      await traceComposerSave(app, "save:calendar-sync-done", String(added));
    } catch (syncErr) {
      console.warn("Universal Daily Note: Kalender-Sync nach Speichern", syncErr);
      void traceComposerSave(app, "save:calendar-sync-error", String(syncErr));
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
    const releaseMetadataNotify = suppressVaultMetadataNotify();
    try {
      await traceComposerSave(app, "save:begin", file.path);
      entries = dedupeSupplementProfileEntries(entries);
      const dateKey = composerDateKey(currentDate);
      const entryTexts = collectEntryTextsForSave();
      await traceComposerSave(app, "save:tagebuch");
      await saveComposerState(
        app,
        {
          file,
          journalHeading: TAGEBUCH_HEADING,
          calloutTitle,
          summary,
          dateKey,
          photos: hasSupplementPhotoEntries ? [] : listPhotos,
        },
        entryTexts,
      );
      await traceComposerSave(app, "save:reisen", String(entries.filter((e) => e.profile === "reisen").length));
      await syncReisenSupplements(app, file, entries, reiseSortOrder);
      await traceComposerSave(app, "save:lueftung");
      await syncLueftungSupplements(app, file, entries, currentDate, feedDetailLayout);
      await traceComposerSave(app, "save:heizung");
      await syncHeizungSupplements(app, file, entries, currentDate, feedDetailLayout);
      await traceComposerSave(app, "save:gedanken");
      await syncGedankenSupplements(app, file, entries);
      await traceComposerSave(app, "save:sonstiges");
      await syncSonstigesSupplements(app, file, entries);
      await traceComposerSave(app, "save:wandern");
      await syncWandernSupplements(app, file, entries, currentDate, wandernLayout);
      await traceComposerSave(app, "save:spaziergang");
      await syncSpaziergangSupplements(app, file, entries, currentDate, spaziergangLayout);
      await traceComposerSave(app, "save:calendar-overrides");
      await persistCalendarLinkOverrides(app, entries);
      await notifyVaultFileChanged(app, file);
      await traceComposerSave(app, "save:metadata-notify");
    } finally {
      releaseMetadataNotify();
    }
  }

  async function save() {
    if (saving || loading) return;
    if (!composerFile && !filePath) {
      new Notice("Notiz noch nicht geladen.");
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    await tick();
    flushPendingSummary();
    saving = true;
    let saved = false;
    const savedDate = currentDate;
    try {
      console.info("Universal Daily Note: Composer save start", activeHeading, filePath);
      void traceComposerSave(app, "save:click", `${activeHeading} ${filePath}`);
      await withOperationTimeout(
        persistComposerSave(),
        12_000,
        "Speichern dauerte länger als 12 s.",
      );
      console.info("Universal Daily Note: Composer save done", activeHeading, filePath);
      await traceComposerSave(app, "save:done");
      saved = true;
      modified = false;
      clearComposerDraft();
      markComposerSaved(composerDateKey(savedDate));
      onClose();
      await traceComposerSave(app, "save:after-close");
      onSaved(savedDate);
      await traceComposerSave(app, "save:after-onsaved");
    } catch (e) {
      console.error("Universal Daily Note: Composer save", e);
      const message = e instanceof Error ? e.message : "";
      void traceComposerSave(app, "save:error", message || String(e));
      loadError = message || "Speichern fehlgeschlagen.";
      new Notice(loadError);
    } finally {
      saving = false;
    }
    if (saved) {
      window.setTimeout(() => void syncCalendarAfterSave(savedDate), 0);
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
          bind:this={headingBtn}
          class="udn-headingFilter udn-headingFilter--journal"
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
          class="udn-headingFilter udn-headingFilter--journal"
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
      {#if !hasSupplementPhotoEntries}
      <PhotoCollageField
        {app}
        photos={listPhotos}
        maxPhotos={currentMaxPhotos()}
        onAddPhotoClick={onComposerAddPhotoClick}
        onRemovePhoto={onListRemovePhoto}
        onMovePhotoUp={onListMovePhotoUp}
        onMovePhotoDown={onListMovePhotoDown}
      />
      {/if}
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
            class:udn-composerEntry--lueftung={entry.profile === "lueftung"}
            class:udn-composerEntry--heizung={entry.profile === "heizung"}
            class:udn-composerEntry--gedanken={entry.profile === "gedanken"}
            class:udn-composerEntry--sonstiges={entry.profile === "sonstiges"}
            class:udn-composerEntry--wandern={entry.profile === "wandern"}
            class:udn-composerEntry--spaziergang={entry.profile === "spaziergang"}
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
              className="udn-timelineEntryEdit udn-composerEntryInput{entry.body.trim() ? '' : ' udn-composerEntryInput--empty'}"
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
                  {app}
                  sourcePath={filePath}
                  reise={entry.context ?? ""}
                  detail={entry.supplementDetail ?? ""}
                  photos={entry.supplementPhotos ?? []}
                  maxPhotos={reisenMaxPhotos}
                  reiseOptions={reiseGroupSuggestions}
                  onReiseChange={(value) => onEntryReiseChange(entry.id, value)}
                  onAddReiseOption={addReiseGroupLabel}
                  onHideReiseOption={hideReiseGroupLabel}
                  onDetailChange={(value) => onEntrySupplementDetailChange(entry.id, value)}
                  onAddPhotoClick={() => onReisenAddPhotoClick(entry.id)}
                  onAddVaultPhotoClick={() => onReisenAddVaultPhotoClick(entry.id)}
                  onRemovePhoto={(index) => onReisenRemovePhoto(entry.id, index)}
                  onMovePhotoUp={(index) => onReisenMovePhotoUp(entry.id, index)}
                  onMovePhotoDown={(index) => onReisenMovePhotoDown(entry.id, index)}
                  onFocus={onMobileInputFocus}
                />
              </div>
            {:else if expandedEntryId === entry.id && entry.profile === "lueftung" && !landscapeMobile}
              <div class="udn-composerEntryExpand udn-composerEntryExpand--lueftung">
                <LueftungComposerFields
                  {app}
                  sourcePath={filePath}
                  wartung={entry.context ?? ""}
                  detail={entry.supplementDetail ?? ""}
                  photos={entry.supplementPhotos ?? []}
                  maxPhotos={lueftungMaxPhotos}
                  wartungOptions={wartungGroupSuggestions}
                  onWartungChange={(value) => onEntryWartungChange(entry.id, value)}
                  onAddWartungOption={addWartungGroupLabel}
                  onHideWartungOption={hideWartungGroupLabel}
                  onDetailChange={(value) => onEntrySupplementDetailChange(entry.id, value)}
                  onAddPhotoClick={() => onLueftungAddPhotoClick(entry.id)}
                  onAddVaultPhotoClick={() => onLueftungAddVaultPhotoClick(entry.id)}
                  onRemovePhoto={(index) => onLueftungRemovePhoto(entry.id, index)}
                  onMovePhotoUp={(index) => onLueftungMovePhotoUp(entry.id, index)}
                  onMovePhotoDown={(index) => onLueftungMovePhotoDown(entry.id, index)}
                  onFocus={onMobileInputFocus}
                />
              </div>
            {:else if expandedEntryId === entry.id && entry.profile === "heizung" && !landscapeMobile}
              <div class="udn-composerEntryExpand udn-composerEntryExpand--heizung">
                <HeizungComposerFields
                  {app}
                  sourcePath={filePath}
                  vorfall={entry.context ?? ""}
                  detail={entry.supplementDetail ?? ""}
                  photos={entry.supplementPhotos ?? []}
                  maxPhotos={heizungMaxPhotos}
                  vorfallOptions={vorfallGroupSuggestions}
                  onVorfallChange={(value) => onEntryVorfallChange(entry.id, value)}
                  onAddVorfallOption={addVorfallGroupLabel}
                  onHideVorfallOption={hideVorfallGroupLabel}
                  onDetailChange={(value) => onEntrySupplementDetailChange(entry.id, value)}
                  onAddPhotoClick={() => onHeizungAddPhotoClick(entry.id)}
                  onAddVaultPhotoClick={() => onHeizungAddVaultPhotoClick(entry.id)}
                  onRemovePhoto={(index) => onHeizungRemovePhoto(entry.id, index)}
                  onMovePhotoUp={(index) => onHeizungMovePhotoUp(entry.id, index)}
                  onMovePhotoDown={(index) => onHeizungMovePhotoDown(entry.id, index)}
                  onFocus={onMobileInputFocus}
                />
              </div>
            {:else if expandedEntryId === entry.id && entry.profile === "gedanken" && !landscapeMobile}
              <div class="udn-composerEntryExpand udn-composerEntryExpand--gedanken">
                <GedankenComposerFields
                  {app}
                  sourcePath={filePath}
                  thema={entry.context ?? ""}
                  detail={entry.supplementDetail ?? ""}
                  themaOptions={themaGroupSuggestions}
                  onThemaChange={(value) => onEntryThemaChange(entry.id, value)}
                  onAddThemaOption={addThemaGroupLabel}
                  onHideThemaOption={hideThemaGroupLabel}
                  onDetailChange={(value) => onEntrySupplementDetailChange(entry.id, value)}
                  onFocus={onMobileInputFocus}
                />
              </div>
            {:else if expandedEntryId === entry.id && entry.profile === "sonstiges" && !landscapeMobile}
              <div class="udn-composerEntryExpand udn-composerEntryExpand--sonstiges">
                <SonstigesComposerFields
                  {app}
                  sourcePath={filePath}
                  detail={entry.supplementDetail ?? ""}
                  showReise={showReiseForEntry(entry)}
                  reise={entry.reiseAssignment ?? ""}
                  reiseOptions={reiseGroupSuggestions}
                  onReiseChange={(value) => onEntryWandernReiseChange(entry.id, value)}
                  onAddReiseOption={addReiseGroupLabel}
                  onHideReiseOption={hideReiseGroupLabel}
                  onDetailChange={(value) => onEntrySupplementDetailChange(entry.id, value)}
                  onFocus={onMobileInputFocus}
                />
              </div>
            {:else if expandedEntryId === entry.id && isWalkProfile(entry.profile) && !landscapeMobile}
              <div class="udn-composerEntryExpand udn-composerEntryExpand--wandern">
                <WandernComposerFields
                  {app}
                  sourcePath={filePath}
                  showReise={isWalkProfile(entry.profile)}
                  reise={isWalkProfile(entry.profile) ? (entry.reiseAssignment ?? "") : ""}
                  reiseOptions={isWalkProfile(entry.profile) ? reiseGroupSuggestions : []}
                  beschreibung={entry.supplementDetail ?? ""}
                  track={trackMatchFromPath(entry.supplementTrackPath)}
                  photos={entry.supplementPhotos ?? []}
                  maxPhotos={walkMaxPhotosForEntry(entry)}
                  trackPickerOpen={wandernTrackPickerEntryId === entry.id}
                  trackPickerLoading={wandernTrackPickerLoading}
                  trackOptions={wandernTrackOptions}
                  previewMarkdown={walkPreviewForEntry(entry)}
                  showPreview={false}
                  onReiseChange={(value) => onEntryWandernReiseChange(entry.id, value)}
                  onAddReiseOption={addReiseGroupLabel}
                  onHideReiseOption={hideReiseGroupLabel}
                  onBeschreibungChange={(value) => onEntrySupplementDetailChange(entry.id, value)}
                  onPickTrackClick={() => void openWandernTrackPicker(entry.id)}
                  onTrackOptionPick={(option) => {
                    onEntryWandernTrackChange(entry.id, option.track);
                    wandernTrackPickerEntryId = null;
                  }}
                  onClearTrackClick={() => onEntryWandernTrackChange(entry.id, null)}
                  onAddPhotoClick={() => onComposerAddPhotoClick(entry.id)}
                  onRemovePhoto={(index) => {
                    const photos = entry.supplementPhotos ?? [];
                    updateEntry(entry.id, { supplementPhotos: photos.filter((_, i) => i !== index) });
                    markModified();
                  }}
                  onMovePhotoUp={(index) => {
                    updateEntry(entry.id, {
                      supplementPhotos: movePhotoAtIndex(entry.supplementPhotos ?? [], index, -1),
                    });
                    markModified();
                  }}
                  onMovePhotoDown={(index) => {
                    updateEntry(entry.id, {
                      supplementPhotos: movePhotoAtIndex(entry.supplementPhotos ?? [], index, 1),
                    });
                    markModified();
                  }}
                  onTogglePreview={() => {}}
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
            {app}
            sourcePath={filePath}
            reise={expandedEntry.context ?? ""}
            detail={expandedEntry.supplementDetail ?? ""}
            photos={expandedEntry.supplementPhotos ?? []}
            maxPhotos={reisenMaxPhotos}
            reiseOptions={reiseGroupSuggestions}
            onReiseChange={(value) => onEntryReiseChange(expandedEntry.id, value)}
            onAddReiseOption={addReiseGroupLabel}
            onHideReiseOption={hideReiseGroupLabel}
            onDetailChange={(value) => onEntrySupplementDetailChange(expandedEntry.id, value)}
            onAddPhotoClick={() => onReisenAddPhotoClick(expandedEntry.id)}
            onAddVaultPhotoClick={() => onReisenAddVaultPhotoClick(expandedEntry.id)}
            onRemovePhoto={(index) => onReisenRemovePhoto(expandedEntry.id, index)}
            onMovePhotoUp={(index) => onReisenMovePhotoUp(expandedEntry.id, index)}
            onMovePhotoDown={(index) => onReisenMovePhotoDown(expandedEntry.id, index)}
            onFocus={onMobileInputFocus}
          />
        </div>
      {:else if landscapeMobile && expandedEntry?.profile === "lueftung"}
        <div class="udn-composerSplitDetail">
          <p class="udn-composerSplitDetailTitle">{feedProfileLabel(expandedEntry.profile)}</p>
          <LueftungComposerFields
            {app}
            sourcePath={filePath}
            wartung={expandedEntry.context ?? ""}
            detail={expandedEntry.supplementDetail ?? ""}
            photos={expandedEntry.supplementPhotos ?? []}
            maxPhotos={lueftungMaxPhotos}
            wartungOptions={wartungGroupSuggestions}
            onWartungChange={(value) => onEntryWartungChange(expandedEntry.id, value)}
            onAddWartungOption={addWartungGroupLabel}
            onHideWartungOption={hideWartungGroupLabel}
            onDetailChange={(value) => onEntrySupplementDetailChange(expandedEntry.id, value)}
            onAddPhotoClick={() => onLueftungAddPhotoClick(expandedEntry.id)}
            onAddVaultPhotoClick={() => onLueftungAddVaultPhotoClick(expandedEntry.id)}
            onRemovePhoto={(index) => onLueftungRemovePhoto(expandedEntry.id, index)}
            onMovePhotoUp={(index) => onLueftungMovePhotoUp(expandedEntry.id, index)}
            onMovePhotoDown={(index) => onLueftungMovePhotoDown(expandedEntry.id, index)}
            onFocus={onMobileInputFocus}
          />
        </div>
      {:else if landscapeMobile && expandedEntry?.profile === "heizung"}
        <div class="udn-composerSplitDetail">
          <p class="udn-composerSplitDetailTitle">{feedProfileLabel(expandedEntry.profile)}</p>
          <HeizungComposerFields
            {app}
            sourcePath={filePath}
            vorfall={expandedEntry.context ?? ""}
            detail={expandedEntry.supplementDetail ?? ""}
            photos={expandedEntry.supplementPhotos ?? []}
            maxPhotos={heizungMaxPhotos}
            vorfallOptions={vorfallGroupSuggestions}
            onVorfallChange={(value) => onEntryVorfallChange(expandedEntry.id, value)}
            onAddVorfallOption={addVorfallGroupLabel}
            onHideVorfallOption={hideVorfallGroupLabel}
            onDetailChange={(value) => onEntrySupplementDetailChange(expandedEntry.id, value)}
            onAddPhotoClick={() => onHeizungAddPhotoClick(expandedEntry.id)}
            onAddVaultPhotoClick={() => onHeizungAddVaultPhotoClick(expandedEntry.id)}
            onRemovePhoto={(index) => onHeizungRemovePhoto(expandedEntry.id, index)}
            onMovePhotoUp={(index) => onHeizungMovePhotoUp(expandedEntry.id, index)}
            onMovePhotoDown={(index) => onHeizungMovePhotoDown(expandedEntry.id, index)}
            onFocus={onMobileInputFocus}
          />
        </div>
      {:else if landscapeMobile && expandedEntry?.profile === "gedanken"}
        <div class="udn-composerSplitDetail">
          <p class="udn-composerSplitDetailTitle">{feedProfileLabel(expandedEntry.profile)}</p>
          <GedankenComposerFields
            {app}
            sourcePath={filePath}
            thema={expandedEntry.context ?? ""}
            detail={expandedEntry.supplementDetail ?? ""}
            themaOptions={themaGroupSuggestions}
            onThemaChange={(value) => onEntryThemaChange(expandedEntry.id, value)}
            onAddThemaOption={addThemaGroupLabel}
            onHideThemaOption={hideThemaGroupLabel}
            onDetailChange={(value) => onEntrySupplementDetailChange(expandedEntry.id, value)}
            onFocus={onMobileInputFocus}
          />
        </div>
      {:else if landscapeMobile && expandedEntry?.profile === "sonstiges"}
        <div class="udn-composerSplitDetail">
          <p class="udn-composerSplitDetailTitle">{feedProfileLabel(expandedEntry.profile)}</p>
          <SonstigesComposerFields
            {app}
            sourcePath={filePath}
            detail={expandedEntry.supplementDetail ?? ""}
            showReise={showReiseForEntry(expandedEntry)}
            reise={expandedEntry.reiseAssignment ?? ""}
            reiseOptions={reiseGroupSuggestions}
            onReiseChange={(value) => onEntryWandernReiseChange(expandedEntry.id, value)}
            onAddReiseOption={addReiseGroupLabel}
            onHideReiseOption={hideReiseGroupLabel}
            onDetailChange={(value) => onEntrySupplementDetailChange(expandedEntry.id, value)}
            onFocus={onMobileInputFocus}
          />
        </div>
      {:else if landscapeMobile && expandedEntry && isWalkProfile(expandedEntry.profile)}
        <div class="udn-composerSplitDetail">
          <p class="udn-composerSplitDetailTitle">{feedProfileLabel(expandedEntry.profile)}</p>
          <WandernComposerFields
            {app}
            sourcePath={filePath}
            showReise={isWalkProfile(expandedEntry.profile)}
            reise={isWalkProfile(expandedEntry.profile) ? (expandedEntry.reiseAssignment ?? "") : ""}
            reiseOptions={isWalkProfile(expandedEntry.profile) ? reiseGroupSuggestions : []}
            beschreibung={expandedEntry.supplementDetail ?? ""}
            track={trackMatchFromPath(expandedEntry.supplementTrackPath)}
            photos={expandedEntry.supplementPhotos ?? []}
            maxPhotos={walkMaxPhotosForEntry(expandedEntry)}
            trackPickerOpen={wandernTrackPickerEntryId === expandedEntry.id}
            trackPickerLoading={wandernTrackPickerLoading}
            trackOptions={wandernTrackOptions}
            previewMarkdown={walkPreviewForEntry(expandedEntry)}
            showPreview={false}
            onReiseChange={(value) => onEntryWandernReiseChange(expandedEntry.id, value)}
            onAddReiseOption={addReiseGroupLabel}
            onHideReiseOption={hideReiseGroupLabel}
            onBeschreibungChange={(value) => onEntrySupplementDetailChange(expandedEntry.id, value)}
            onPickTrackClick={() => void openWandernTrackPicker(expandedEntry.id)}
            onTrackOptionPick={(option) => {
              onEntryWandernTrackChange(expandedEntry.id, option.track);
              wandernTrackPickerEntryId = null;
            }}
            onClearTrackClick={() => onEntryWandernTrackChange(expandedEntry.id, null)}
            onAddPhotoClick={() => onComposerAddPhotoClick(expandedEntry.id)}
            onRemovePhoto={(index) => {
              const photos = expandedEntry.supplementPhotos ?? [];
              updateEntry(expandedEntry.id, { supplementPhotos: photos.filter((_, i) => i !== index) });
              markModified();
            }}
            onMovePhotoUp={(index) => {
              updateEntry(expandedEntry.id, {
                supplementPhotos: movePhotoAtIndex(expandedEntry.supplementPhotos ?? [], index, -1),
              });
              markModified();
            }}
            onMovePhotoDown={(index) => {
              updateEntry(expandedEntry.id, {
                supplementPhotos: movePhotoAtIndex(expandedEntry.supplementPhotos ?? [], index, 1),
              });
              markModified();
            }}
            onTogglePreview={() => {}}
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

  {#if !loading && !loadError && isMobile && !isSpecialFormMode}
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
