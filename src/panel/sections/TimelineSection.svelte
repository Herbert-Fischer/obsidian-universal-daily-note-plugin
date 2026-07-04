<script lang="ts">
  import { afterUpdate, onMount, tick } from "svelte";
  import type { App } from "obsidian";
  import { setIcon, Menu } from "obsidian";
  import { dk, sidebarMenuAction } from "@denkarium/obsidian-lib-ui";
  import { panelTapAction } from "../panelTapAction";
  import type { Writable } from "svelte/store";
  import type { DailyNoteFallbackSettings, OutlineSettings, TagebuchVerweiseSettings } from "../../settings";
  import { DEFAULT_JOURNAL_HEADING, DEFAULT_SETTINGS } from "../../settings";
  import {
    loadOutlineBatch,
    openTimelineEntry,
    groupTimelineDaysByTrip,
    type TimelineDay,
    type TimelineEntry,
    type TimelineSectionGroup,
    type TimelineTripGroup,
  } from "../../notes/dailyNoteTimeline";
import { updateJournalLine } from "../../notes/editJournalLine";
import { resortJournalCalloutEntries } from "../../notes/dailyComposer";
import { dateFromDateKey, stripLeadingGermanDateFromCalloutTitle } from "../../notes/journalCallout";
import { openWikiLinkInMain } from "../../notes/openInMainPane";
import { isWikiLinkSuggestOpen } from "../wikiLinkInputSuggest";
  import { parseJournalEntryDisplay, formatJournalEntryText } from "../../notes/parseJournalEntryDisplay";
  import { entryHueFromIndex, formatDayBubbleLabel } from "../formatDayBubble";
  import TimelineOutlineEntry from "./TimelineOutlineEntry.svelte";

  import type { PanelStore } from "../panelStore";
  import type { CalendarSyncContext, OutlineRangeMode } from "../../integrations/calendarRange";
  import {
    outlineRangeModeLabel,
    resolveOutlineDateBounds,
    resolveOutlineLoadAnchor,
  } from "../../integrations/calendarRange";
  import { filterTimelineDaysByText } from "../../notes/entryTextFilter";
  import {
    feedProfileLabel,
    outlineSectionFiltersLabel,
    OUTLINE_PROFILE_FILTER_OPTIONS,
    normalizeOutlineProfileFilters,
    toggleFeedProfileFilter,
    type FeedProfile,
  } from "../../notes/feedMetadata";
  import FlexTextFilter from "./FlexTextFilter.svelte";
  import { COMPOSER_ICON, COMPOSER_LABEL } from "../composer/composerUi";
  import { TASK_COMPOSER_ICON, TASK_COMPOSER_LABEL } from "../../integrations/universalTasks";
  import { WEATHER_ICON, WEATHER_LABEL } from "../../weather/weatherUi";

  const OUTLINE_LOAD_HEADING = DEFAULT_JOURNAL_HEADING;

  function selectedDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function entryId(day: TimelineDay, entry: TimelineEntry): string {
    return `${day.dateKey}:${entry.line}`;
  }

  function sectionGroupsForDay(day: TimelineDay): TimelineSectionGroup[] {
    if (day.sectionGroups && day.sectionGroups.length > 0) return day.sectionGroups;
    return [{ section: "", calloutTitle: "", entries: day.entries }];
  }

  function outlineSectionCalloutLabel(group: TimelineSectionGroup): string {
    const title = group.calloutTitle.trim();
    if (group.section.trim().toLowerCase() === DEFAULT_JOURNAL_HEADING.toLowerCase()) {
      return stripLeadingGermanDateFromCalloutTitle(title);
    }
    return title;
  }

  function sectionCalloutDiffers(group: TimelineSectionGroup): boolean {
    const label = outlineSectionCalloutLabel(group);
    if (!label) return false;
    return label.toLowerCase() !== group.section.trim().toLowerCase();
  }

  export let app: App;
  export let store: PanelStore;
  export let selectedDate: Writable<Date>;
  export let fallback: DailyNoteFallbackSettings;
  export let tagebuchSettings: TagebuchVerweiseSettings;
  export let outlineSettings: OutlineSettings = DEFAULT_SETTINGS.outline;
  export let onOutlinePatch: (patch: Partial<OutlineSettings>) => void = () => {};
  export let onOpenComposer: (date: Date) => void = () => {};
  export let onOpenTaskComposer: (date: Date) => void = () => {};
  export let onInsertWeather: (date: Date) => void = () => {};
  export let onSelectDay: (dateKey: string) => void = () => {};

  const { refreshTick, calendarContext } = store;

  let days: TimelineDay[] = [];
  let loading = false;
  let loadingMore = false;
  let hasMore = false;
  let listEl: HTMLDivElement;
  let scrollBodyEl: HTMLDivElement;
  let scrollHost: HTMLElement | null = null;
  let timeToggleBtn: HTMLButtonElement;
  let filterBtn: HTMLButtonElement;
  let filterIconEl: HTMLSpanElement;
  let rangeBtn: HTMLButtonElement;
  let rangeIconEl: HTMLSpanElement;
  let dailyNoteBtn: HTMLButtonElement;
  let weatherBtn: HTMLButtonElement;
  let taskComposerBtn: HTMLButtonElement;
  let loadGeneration = 0;
  let lastLoadSignature = "";
  let lastScrolledDateKey = "";
  let lastRefreshKey = -1;
  let editingId: string | null = null;
  let editTime = "";
  let editBody = "";
  let editInput: HTMLInputElement | undefined;

  $: pageSize = Math.max(1, outlineSettings?.pageSize ?? 10);
  $: showTimeBubbles = outlineSettings?.showTimeBubbles ?? true;
  $: durationDays = Math.max(1, outlineSettings?.durationDays ?? 365);
  $: excludedHeadings = outlineSettings?.excludedHeadings ?? [];
  $: feedProfileFilters = normalizeOutlineProfileFilters(outlineSettings?.feedProfileFilters ?? []);
  $: includeRestOfTagebuch = outlineSettings?.includeRestOfTagebuch ?? false;
  $: feedContextFilter = outlineSettings?.feedContextFilter ?? "";
  $: sectionFiltersLabel = outlineSectionFiltersLabel(feedProfileFilters, includeRestOfTagebuch);
  $: rangeMode = outlineSettings?.rangeMode ?? "scroll";
  $: textFilterEnabled = outlineSettings?.textFilterEnabled ?? false;
  $: textFilterQuery = outlineSettings?.textFilterQuery ?? "";
  $: textSearchActive = textFilterEnabled && textFilterQuery.trim().length > 0;
  $: displayDays = filterTimelineDaysByText(
    days,
    textFilterEnabled ? textFilterQuery : "",
  );
  $: bounded = rangeMode !== "scroll";
  $: calCtx = buildCalendarCtx(noteDate, $calendarContext);
  $: dateBounds = resolveOutlineDateBounds(rangeMode, calCtx);
  $: showSectionLabels = false;
  $: showTripGroups = feedProfileFilters.includes("reisen");
  $: tripGroups = showTripGroups ? groupTimelineDaysByTrip(displayDays) : [];
  $: refreshKey = $refreshTick;
  $: noteDate = $selectedDate;
  $: textSearchSignature = `${textFilterEnabled}|${textFilterQuery.trim().toLowerCase()}`;
  $: loadSignature = buildLoadSignature(
    rangeMode,
    noteDate,
    $calendarContext,
    feedProfileFilters,
    includeRestOfTagebuch,
    feedContextFilter,
    refreshKey,
    textSearchSignature,
  );

  $: if (loadSignature !== lastLoadSignature) {
    lastLoadSignature = loadSignature;
    void resetAndLoad(feedProfileFilters, includeRestOfTagebuch, feedContextFilter);
  }

  $: if (!loading) {
    const key = selectedDateKey(noteDate);
    const refreshChanged = refreshKey !== lastRefreshKey;
    if (key !== lastScrolledDateKey || refreshChanged) {
      lastScrolledDateKey = key;
      lastRefreshKey = refreshKey;
      void tick().then(() => {
        scrollToDate(key);
        void ensureSelectedDayVisible(key);
      });
    } else if (rangeMode === "scroll" && !textSearchActive && !days.some((d) => d.dateKey === key)) {
      void ensureSelectedDayVisible(key);
    }
  }

  async function ensureSelectedDayVisible(dateKey: string) {
    if (rangeMode !== "scroll" || textSearchActive || loading || days.some((d) => d.dateKey === dateKey)) {
      return;
    }

    const [y, m, d] = dateKey.split("-").map(Number);
    if (!y || !m || !d) return;

    const generation = loadGeneration;
    const date = new Date(y, m - 1, d);
    const activeFilters = normalizeOutlineProfileFilters(feedProfileFilters);
    const timeline = { durationDays, journalHeading: OUTLINE_LOAD_HEADING, excludedHeadings };
    try {
      const batch = await loadOutlineBatch(app, date, fallback, tagebuchSettings, timeline, {
        pageSize: Math.max(3, pageSize),
        feedProfileFilters: activeFilters,
        feedContextFilter,
        includeRestOfTagebuch: activeFilters.length > 0 && includeRestOfTagebuch,
      });
      if (generation !== loadGeneration) return;

      const existing = new Set(days.map((day) => day.dateKey));
      const merged = batch.days.filter((day) => !existing.has(day.dateKey));
      if (merged.length === 0) return;

      days = [...days, ...merged].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
      await tick();
      scrollToDate(dateKey);
    } catch (e) {
      console.error("Universal Daily Note: ensure selected day", e);
    }
  }

  function buildCalendarCtx(date: Date, ctx: CalendarSyncContext | null): CalendarSyncContext {
    const selected = ctx?.selectedDate ?? date;
    const normalized = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), 0, 0, 0, 0);
    const monthCursor = ctx?.monthCursor ?? new Date(normalized.getFullYear(), normalized.getMonth(), 1);
    return { selectedDate: normalized, monthCursor };
  }

  function buildLoadSignature(
    mode: OutlineRangeMode,
    date: Date,
    ctx: CalendarSyncContext | null,
    filters: FeedProfile[],
    includeRest: boolean,
    contextFilter: string,
    refresh: number,
    textSearch: string,
  ): string {
    const cal = buildCalendarCtx(date, ctx);
    const bounds = resolveOutlineDateBounds(mode, cal);
    const boundsPart = bounds ? `${bounds.startDateKey}:${bounds.endDateKey}` : "scroll";
    const filterPart = `${filters.join(",")}|${includeRest}|${contextFilter.trim().toLowerCase()}`;
    return `${mode}|${boundsPart}|${OUTLINE_LOAD_HEADING}|${filterPart}|${selectedDateKey(cal.monthCursor)}|${refresh}|${textSearch}`;
  }

  function outlineLoadContext(date: Date = noteDate): CalendarSyncContext {
    return buildCalendarCtx(date, $calendarContext);
  }

  function outlineLoadAnchor(date: Date = noteDate): Date {
    return resolveOutlineLoadAnchor(rangeMode, outlineLoadContext(date));
  }

  function outlineBatchOptions(
    bounds: ReturnType<typeof resolveOutlineDateBounds>,
    filters: FeedProfile[],
    includeRest: boolean,
    contextFilter: string,
  ) {
    const active = textFilterEnabled && textFilterQuery.trim().length > 0;
    const activeFilters = normalizeOutlineProfileFilters(filters);
    return {
      pageSize,
      bounds,
      loadAll: active && !bounds,
      maxDaysBack: active && !bounds ? durationDays : undefined,
      textQuery: active ? textFilterQuery : undefined,
      feedProfileFilters: activeFilters,
      feedContextFilter: contextFilter,
      includeRestOfTagebuch: activeFilters.length > 0 && includeRest,
    };
  }

  async function resetAndLoad(
    filters: FeedProfile[] = feedProfileFilters,
    includeRest: boolean = includeRestOfTagebuch,
    contextFilter: string = feedContextFilter,
  ) {
    editingId = null;
    const generation = ++loadGeneration;
    loading = true;
    loadingMore = false;
    days = [];
    const ctx = outlineLoadContext();
    const loadAnchor = outlineLoadAnchor();
    const bounds = resolveOutlineDateBounds(rangeMode, ctx);
    const batchOpts = outlineBatchOptions(bounds, filters, includeRest, contextFilter);
    const timeline = { durationDays, journalHeading: OUTLINE_LOAD_HEADING, excludedHeadings };
    try {
      const batch = await loadOutlineBatch(app, loadAnchor, fallback, tagebuchSettings, timeline, batchOpts);
      if (generation !== loadGeneration) return;
      days = batch.days;
      hasMore = textSearchActive ? false : batch.hasMore;
    } catch (e) {
      if (generation !== loadGeneration) return;
      console.error("Universal Daily Note: Timeline", e);
      days = [];
      hasMore = false;
    } finally {
      if (generation === loadGeneration) loading = false;
    }
  }

  async function loadMore() {
    if (bounded || textSearchActive || loading || loadingMore || !hasMore || days.length === 0) return;
    const oldest = days[days.length - 1]?.dateKey;
    if (!oldest) return;

    loadingMore = true;
    const generation = loadGeneration;
    const activeFilters = normalizeOutlineProfileFilters(feedProfileFilters);
    const timeline = { durationDays, journalHeading: OUTLINE_LOAD_HEADING, excludedHeadings };
    try {
      const batch = await loadOutlineBatch(app, outlineLoadAnchor(), fallback, tagebuchSettings, timeline, {
        pageSize,
        beforeDateKey: oldest,
        feedProfileFilters: activeFilters,
        feedContextFilter,
        includeRestOfTagebuch: activeFilters.length > 0 && includeRestOfTagebuch,
      });
      if (generation !== loadGeneration) return;
      if (batch.days.length === 0) {
        hasMore = false;
        return;
      }
      days = [...days, ...batch.days].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
      hasMore = batch.hasMore;
    } catch (e) {
      console.error("Universal Daily Note: Timeline load more", e);
    } finally {
      if (generation === loadGeneration) {
        loadingMore = false;
        await tick();
        checkScrollLoadMore();
      }
    }
  }

  function resolveScrollHost(): HTMLElement | null {
    if (scrollBodyEl) return scrollBodyEl;
    return listEl?.closest(".dk-scrollHost") ?? listEl;
  }

  function bindScrollHost() {
    const host = resolveScrollHost();
    if (host === scrollHost) return;
    scrollHost?.removeEventListener("scroll", onListScroll);
    scrollHost = host;
    scrollHost?.addEventListener("scroll", onListScroll, { passive: true });
  }

  function checkScrollLoadMore() {
    if (bounded || textSearchActive || !scrollHost || loading || loadingMore || !hasMore) return;
    const nearBottom =
      scrollHost.scrollTop + scrollHost.clientHeight >= scrollHost.scrollHeight - 64;
    if (nearBottom) void loadMore();
  }

  function onListScroll() {
    checkScrollLoadMore();
  }

  function scrollToDate(dateKey: string) {
    if (!listEl) return;
    let target = listEl.querySelector<HTMLElement>(`[data-date-key="${dateKey}"]`);
    if (!target) {
      target = listEl.querySelector<HTMLElement>("[data-date-key]");
    }
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function openDailyNote() {
    onOpenComposer($selectedDate);
  }

  function openTaskComposer() {
    onOpenTaskComposer($selectedDate);
  }

  function insertWeather() {
    onInsertWeather($selectedDate);
  }

  function openDayNote(day: TimelineDay) {
    selectDay(day);
    void openTimelineEntry(app, day.filePath, 0);
  }

  function selectDay(day: TimelineDay) {
    onSelectDay(day.dateKey);
  }

  function openWikiLink(dest: string, sourcePath: string) {
    void openWikiLinkInMain(app, dest, sourcePath);
  }

  async function startEdit(day: TimelineDay, entry: TimelineEntry) {
    const display = parseJournalEntryDisplay(entry.text);
    editingId = entryId(day, entry);
    editTime = display.time ?? "";
    editBody = display.body;
    await tick();
    editInput?.focus();
    editInput?.select();
  }

  function cancelEdit() {
    editingId = null;
  }

  async function commitEdit(day: TimelineDay, entry: TimelineEntry) {
    if (editingId !== entryId(day, entry)) return;
    const trimmed = formatJournalEntryText(editTime, editBody).trim();
    editingId = null;
    if (!trimmed || trimmed === entry.text) return;

    const ok = await updateJournalLine(app, day.filePath, entry.line, entry.rawLine, trimmed);
    if (ok) {
      await resortJournalCalloutEntries(app, day.filePath, OUTLINE_LOAD_HEADING, dateFromDateKey(day.dateKey));
      store.refreshTick.update((n) => n + 1);
    }
  }

  async function commitTimeEdit(day: TimelineDay, entry: TimelineEntry, time: string) {
    if (editingId === entryId(day, entry)) return;
    const display = parseJournalEntryDisplay(entry.text);
    const next = formatJournalEntryText(time, display.body);
    if (next === entry.text) return;

    const ok = await updateJournalLine(app, day.filePath, entry.line, entry.rawLine, next);
    if (ok) {
      await resortJournalCalloutEntries(app, day.filePath, OUTLINE_LOAD_HEADING, dateFromDateKey(day.dateKey));
      store.refreshTick.update((n) => n + 1);
    }
  }

  function isEditing(day: TimelineDay, entry: TimelineEntry): boolean {
    return editingId === entryId(day, entry);
  }

  function onEditKeydown(day: TimelineDay, entry: TimelineEntry, ev: KeyboardEvent) {
    if (ev.key === "Enter") {
      if (isWikiLinkSuggestOpen()) return;
      ev.preventDefault();
      void commitEdit(day, entry);
    } else if (ev.key === "Escape") {
      if (isWikiLinkSuggestOpen()) return;
      ev.preventDefault();
      cancelEdit();
    }
  }

  function toggleShowTimeBubbles() {
    onOutlinePatch({ showTimeBubbles: !showTimeBubbles });
  }

  function selectRangeMode(mode: OutlineRangeMode) {
    if (mode === rangeMode) return;
    onOutlinePatch({ rangeMode: mode });
  }

  function openRangeMenu() {
    if (!rangeBtn) return;
    const modes: OutlineRangeMode[] = ["scroll", "month", "week"];
    const menu = new Menu();
    for (const mode of modes) {
      menu.addItem((item) => {
        item.setTitle(outlineRangeModeLabel(mode));
        item.setChecked(mode === rangeMode);
        item.onClick(() => selectRangeMode(mode));
      });
    }
    const rect = rangeBtn.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
  }

  function onRangeFilterClick() {
    openRangeMenu();
  }

  function toggleSectionFilter(profile: FeedProfile) {
    const next = toggleFeedProfileFilter(feedProfileFilters, profile);
    onOutlinePatch({
      feedProfileFilters: next,
      ...(next.length === 0 ? { includeRestOfTagebuch: false } : {}),
    });
  }

  function toggleIncludeRestOfTagebuch() {
    if (feedProfileFilters.length === 0) return;
    onOutlinePatch({ includeRestOfTagebuch: !includeRestOfTagebuch });
  }

  function openSectionFilterMenu() {
    if (!filterBtn) return;
    const menu = new Menu();
    for (const profile of OUTLINE_PROFILE_FILTER_OPTIONS) {
      menu.addItem((item) => {
        item.setTitle(feedProfileLabel(profile));
        item.setChecked(feedProfileFilters.includes(profile));
        item.onClick(() => {
          toggleSectionFilter(profile);
          void tick().then(() => openSectionFilterMenu());
        });
      });
    }
    if (feedProfileFilters.length > 0) {
      menu.addSeparator();
      menu.addItem((item) => {
        item.setTitle("Rest des Tagebuchs einblenden");
        item.setChecked(includeRestOfTagebuch);
        item.onClick(() => {
          toggleIncludeRestOfTagebuch();
          void tick().then(() => openSectionFilterMenu());
        });
      });
    }
    const rect = filterBtn.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
  }

  function onSectionFilterClick() {
    openSectionFilterMenu();
  }

  function updateRangeButton() {
    if (!rangeIconEl) return;
    setIcon(rangeIconEl, "calendar");
    if (rangeBtn) {
      rangeBtn.setAttribute("aria-label", `Zeitraum: ${outlineRangeModeLabel(rangeMode)}`);
      rangeBtn.title = outlineRangeModeLabel(rangeMode);
    }
  }

  function updateFilterButton() {
    if (!filterIconEl) return;
    setIcon(filterIconEl, "filter");
    if (filterBtn) {
      filterBtn.setAttribute("aria-label", `Filter: ${sectionFiltersLabel}`);
      filterBtn.title = sectionFiltersLabel;
    }
  }

  function updateDailyNoteButton() {
    if (!dailyNoteBtn) return;
    setIcon(dailyNoteBtn, COMPOSER_ICON);
    dailyNoteBtn.setAttribute("aria-label", COMPOSER_LABEL);
    dailyNoteBtn.title = COMPOSER_LABEL;
  }

  function updateTaskComposerButton() {
    if (!taskComposerBtn) return;
    setIcon(taskComposerBtn, TASK_COMPOSER_ICON);
    taskComposerBtn.setAttribute("aria-label", TASK_COMPOSER_LABEL);
    taskComposerBtn.title = TASK_COMPOSER_LABEL;
  }

  function updateWeatherButton() {
    if (!weatherBtn) return;
    setIcon(weatherBtn, WEATHER_ICON);
    weatherBtn.setAttribute("aria-label", WEATHER_LABEL);
    weatherBtn.title = WEATHER_LABEL;
  }

  function updateTimeToggleButton() {
    if (!timeToggleBtn) return;
    setIcon(timeToggleBtn, "clock");
    timeToggleBtn.classList.toggle(dk.iconRoundBtnActive, showTimeBubbles);
    timeToggleBtn.setAttribute(
      "aria-label",
      showTimeBubbles
        ? "Zeit-Bubbles: an — Klicken zum Ausblenden"
        : "Zeit-Bubbles: aus — Klicken zum Einblenden",
    );
    timeToggleBtn.setAttribute("aria-pressed", showTimeBubbles ? "true" : "false");
  }

  afterUpdate(() => {
    bindScrollHost();
    updateRangeButton();
    updateFilterButton();
    updateTimeToggleButton();
    updateDailyNoteButton();
    updateWeatherButton();
    updateTaskComposerButton();
  });

  onMount(() => {
    bindScrollHost();
    updateRangeButton();
    updateFilterButton();
    updateTimeToggleButton();
    updateDailyNoteButton();
    updateWeatherButton();
    updateTaskComposerButton();
    return () => {
      scrollHost?.removeEventListener("scroll", onListScroll);
      scrollHost = null;
    };
  });
</script>

<div class="udn-timeline">
  <div class="udn-timelineToolbar">
    <div class="udn-timelineHead">
      <div class="udn-timelineHeadFilters">
        <button
          type="button"
          bind:this={rangeBtn}
          class="udn-headingFilter udn-headingFilter--menu"
          use:sidebarMenuAction={onRangeFilterClick}
        >
          <span class="udn-headingFilterIcon" bind:this={rangeIconEl} aria-hidden="true"></span>
          <span class="udn-headingFilterLabel">{outlineRangeModeLabel(rangeMode)}</span>
        </button>
        <button
          type="button"
          bind:this={filterBtn}
          class="udn-headingFilter udn-headingFilter--journal udn-headingFilter--menu"
          use:sidebarMenuAction={onSectionFilterClick}
        >
          <span class="udn-headingFilterIcon" bind:this={filterIconEl} aria-hidden="true"></span>
          <span class="udn-headingFilterLabel">{sectionFiltersLabel}</span>
        </button>
        <FlexTextFilter
          mode="toggle"
          enabled={textFilterEnabled}
          query={textFilterQuery}
          onPatch={onOutlinePatch}
        />
      </div>
      <div class="udn-timelineHeadActions">
        <button
          type="button"
          bind:this={timeToggleBtn}
          class={dk.iconRoundBtnToolbar}
          use:panelTapAction={toggleShowTimeBubbles}
        ></button>
        <button
          type="button"
          bind:this={dailyNoteBtn}
          class="{dk.iconRoundBtnToolbar} udn-timelineHeadComposer"
          use:panelTapAction={openDailyNote}
        ></button>
        <button
          type="button"
          bind:this={weatherBtn}
          class="{dk.iconRoundBtnToolbar} udn-timelineHeadWeather"
          use:panelTapAction={insertWeather}
        ></button>
        <button
          type="button"
          bind:this={taskComposerBtn}
          class="{dk.iconRoundBtnToolbar} udn-timelineHeadTaskComposer"
          use:panelTapAction={openTaskComposer}
        ></button>
      </div>
    </div>

    <FlexTextFilter
      mode="field"
      enabled={textFilterEnabled}
      query={textFilterQuery}
      onPatch={onOutlinePatch}
    />
  </div>

  <div class="udn-timelineBody" bind:this={scrollBodyEl}>
  {#if loading && days.length === 0}
    <p class={dk.empty}>{textSearchActive ? "Suche Tagebuch…" : "Lade Tagebuch…"}</p>
  {:else if days.length === 0}
    <p class={dk.empty}>
      Keine Einträge ({sectionFiltersLabel}{rangeMode !== "scroll" ? ` · ${outlineRangeModeLabel(rangeMode)}` : ""}).
    </p>
  {:else if displayDays.length === 0}
    <p class={dk.empty}>
      Keine Treffer für „{textFilterQuery.trim()}“ ({sectionFiltersLabel}).
    </p>
  {:else}
    <div
      class="{dk.list} udn-timelineList"
      class:udn-timelineList--noTime={!showTimeBubbles}
      bind:this={listEl}
    >
      {#if showTripGroups}
        {#each tripGroups as group, groupIndex (group.tripLabel ?? `g-${groupIndex}`)}
          <div class="udn-tripGroup">
            {#if group.tripLabel}
              <div class="udn-tripGroupHead">[{group.tripLabel}]</div>
            {/if}
            {#each group.days as day, dayIndex (day.dateKey)}
              {@const isSelected = selectedDateKey($selectedDate) === day.dateKey}
              <div
                class="udn-timelineDay"
                class:udn-timelineDay--selected={isSelected}
                class:udn-timelineDay--inTrip={Boolean(group.tripLabel)}
                style="--ref-hue: {entryHueFromIndex(dayIndex)}"
                data-date-key={day.dateKey}
                use:panelTapAction={() => selectDay(day)}
              >
                <div class="udn-timelineDayHead">
                  <button type="button" class="udn-dateBubble" use:panelTapAction={() => openDayNote(day)}>
                    {formatDayBubbleLabel(day.label)}
                  </button>
                  {#if day.summary}
                    <span class="udn-timelineDaySummary" title={day.summary}>{day.summary}</span>
                  {/if}
                  <span class="udn-timelineDayCount">
                    {day.entries.length === 1 ? "1 Eintrag" : `${day.entries.length} Einträge`}
                  </span>
                </div>
                <div class="udn-timelineDayEntries">
                  {#each day.entries as entry (day.dateKey + entry.line)}
                    <TimelineOutlineEntry
                      {app}
                      {day}
                      {entry}
                      {showTimeBubbles}
                      editing={isEditing(day, entry)}
                      bind:editTime
                      bind:editBody
                      bind:editInput
                      onStartEdit={startEdit}
                      onCommitEdit={commitEdit}
                      onCommitTimeEdit={commitTimeEdit}
                      onEditKeydown={onEditKeydown}
                      onOpenWikiLink={openWikiLink}
                      onSelectDay={selectDay}
                    />
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/each}
      {:else}
        {#each displayDays as day, dayIndex (day.dateKey)}
        {@const isSelected = selectedDateKey($selectedDate) === day.dateKey}
        <div
          class="udn-timelineDay"
          class:udn-timelineDay--selected={isSelected}
          style="--ref-hue: {entryHueFromIndex(dayIndex)}"
          data-date-key={day.dateKey}
          use:panelTapAction={() => selectDay(day)}
        >
          <div class="udn-timelineDayHead">
            <button type="button" class="udn-dateBubble" use:panelTapAction={() => openDayNote(day)}>
              {formatDayBubbleLabel(day.label)}
            </button>
            {#if day.summary}
              <span class="udn-timelineDaySummary" title={day.summary}>{day.summary}</span>
            {/if}
            <span class="udn-timelineDayCount">
              {day.entries.length === 1 ? "1 Eintrag" : `${day.entries.length} Einträge`}
            </span>
          </div>
          <div class="udn-timelineDayEntries">
            {#if showSectionLabels}
              {#each sectionGroupsForDay(day) as sectionGroup (day.dateKey + sectionGroup.section)}
                <div class="udn-sectionGroup">
                  <div class="udn-sectionGroupHead">
                    <span class="udn-sectionGroupHeading">{sectionGroup.section}</span>
                    {#if sectionCalloutDiffers(sectionGroup)}
                      <span class="udn-sectionGroupCallout">{outlineSectionCalloutLabel(sectionGroup)}</span>
                    {/if}
                  </div>
                  <div class="udn-sectionGroupEntries">
                    {#each sectionGroup.entries as entry (day.dateKey + entry.line)}
                      <TimelineOutlineEntry
                        {day}
                        {entry}
                        {showTimeBubbles}
                        editing={isEditing(day, entry)}
                        bind:editTime
                        bind:editBody
                        bind:editInput
                        onStartEdit={startEdit}
                        onCommitEdit={commitEdit}
                        onCommitTimeEdit={commitTimeEdit}
                        onEditKeydown={onEditKeydown}
                        onOpenWikiLink={openWikiLink}
                        onSelectDay={selectDay}
                      />
                    {/each}
                  </div>
                </div>
              {/each}
            {:else}
              {#each day.entries as entry (day.dateKey + entry.line)}
                <TimelineOutlineEntry
                  {app}
                  {day}
                  {entry}
                  {showTimeBubbles}
                  editing={isEditing(day, entry)}
                  bind:editTime
                  bind:editBody
                  bind:editInput
                  onStartEdit={startEdit}
                  onCommitEdit={commitEdit}
                  onCommitTimeEdit={commitTimeEdit}
                  onEditKeydown={onEditKeydown}
                  onOpenWikiLink={openWikiLink}
                  onSelectDay={selectDay}
                />
              {/each}
            {/if}
          </div>
        </div>
        {/each}
      {/if}
      {#if loadingMore}
        <p class="{dk.empty} udn-timelineMore">Lade weitere Tage…</p>
      {/if}
    </div>
  {/if}
  </div>
</div>
