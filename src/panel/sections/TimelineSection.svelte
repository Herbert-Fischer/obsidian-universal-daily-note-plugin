<script lang="ts">
  import { afterUpdate, onMount, tick } from "svelte";
  import type { App } from "obsidian";
  import { setIcon, Menu } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import type { Writable } from "svelte/store";
  import type { DailyNoteFallbackSettings, OutlineSettings, TagebuchVerweiseSettings } from "../../settings";
  import { DEFAULT_JOURNAL_HEADING, DEFAULT_SETTINGS } from "../../settings";
  import {
    loadOutlineBatch,
    loadUsedJournalHeadings,
    openTimelineEntry,
    type TimelineDay,
    type TimelineEntry,
  } from "../../notes/dailyNoteTimeline";
  import { updateJournalLine } from "../../notes/editJournalLine";
  import { openWikiLinkInMain } from "../../notes/openInMainPane";
  import { parseWikiLinks } from "../../notes/parseWikiLinks";
  import { parseJournalEntryDisplay } from "../../notes/parseJournalEntryDisplay";
  import { entryHueFromIndex, formatDayBubbleLabel } from "../formatDayBubble";

  import type { PanelStore } from "../panelStore";
  import type { CalendarSyncContext, OutlineRangeMode } from "../../integrations/calendarRange";
  import {
    outlineRangeModeLabel,
    resolveOutlineDateBounds,
  } from "../../integrations/calendarRange";
  import { filterTimelineDaysByText } from "../../notes/entryTextFilter";
  import FlexTextFilter from "./FlexTextFilter.svelte";

  function selectedDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function entryId(day: TimelineDay, entry: TimelineEntry): string {
    return `${day.dateKey}:${entry.line}`;
  }

  export let app: App;
  export let store: PanelStore;
  export let selectedDate: Writable<Date>;
  export let fallback: DailyNoteFallbackSettings;
  export let tagebuchSettings: TagebuchVerweiseSettings;
  export let outlineSettings: OutlineSettings = DEFAULT_SETTINGS.outline;
  export let onOutlinePatch: (patch: Partial<OutlineSettings>) => void = () => {};
  export let onOpenComposer: (date: Date) => void = () => {};

  const { refreshTick, calendarContext } = store;

  let days: TimelineDay[] = [];
  let usedHeadings: string[] = [];
  let loading = false;
  let loadingMore = false;
  let hasMore = false;
  let listEl: HTMLDivElement;
  let scrollHost: HTMLElement | null = null;
  let timeToggleBtn: HTMLButtonElement;
  let headingBtn: HTMLButtonElement;
  let headingIconEl: HTMLSpanElement;
  let rangeBtn: HTMLButtonElement;
  let rangeIconEl: HTMLSpanElement;
  let dailyNoteBtn: HTMLButtonElement;
  let loadGeneration = 0;
  let lastLoadSignature = "";
  let lastScrollAnchor = "";
  let lastRefreshKey = -1;
  let editingId: string | null = null;
  let editValue = "";
  let editInput: HTMLInputElement;

  $: pageSize = Math.max(1, outlineSettings?.pageSize ?? 10);
  $: showTimeBubbles = outlineSettings?.showTimeBubbles ?? true;
  $: durationDays = Math.max(1, outlineSettings?.durationDays ?? 365);
  $: journalHeading = outlineSettings?.journalHeading ?? DEFAULT_JOURNAL_HEADING;
  $: excludedHeadings = outlineSettings?.excludedHeadings ?? [];
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
  $: dropdownHeadings =
    usedHeadings.length === 0
      ? [journalHeading]
      : usedHeadings.some((h) => h.toLowerCase() === journalHeading.toLowerCase())
        ? usedHeadings
        : [journalHeading, ...usedHeadings];
  $: refreshKey = $refreshTick;
  $: noteDate = $selectedDate;
  $: textSearchSignature = `${textFilterEnabled}|${textFilterQuery.trim().toLowerCase()}`;
  $: loadSignature = buildLoadSignature(
    rangeMode,
    noteDate,
    $calendarContext,
    journalHeading,
    refreshKey,
    textSearchSignature,
  );

  $: if (loadSignature !== lastLoadSignature) {
    const isFirst = lastLoadSignature === "";
    const shouldScroll =
      !isFirst && selectedDateKey(noteDate) !== lastScrollAnchor;
    lastLoadSignature = loadSignature;
    if (shouldScroll) lastScrollAnchor = selectedDateKey(noteDate);
    if (isFirst) lastScrollAnchor = selectedDateKey(noteDate);
    void resetAndLoad(noteDate, shouldScroll || isFirst);
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
    heading: string,
    refresh: number,
    textSearch: string,
  ): string {
    const cal = buildCalendarCtx(date, ctx);
    const bounds = resolveOutlineDateBounds(mode, cal);
    const boundsPart = bounds ? `${bounds.startDateKey}:${bounds.endDateKey}` : "scroll";
    return `${mode}|${boundsPart}|${heading}|${selectedDateKey(cal.selectedDate)}|${selectedDateKey(cal.monthCursor)}|${refresh}|${textSearch}`;
  }

  function outlineBatchOptions(bounds: ReturnType<typeof resolveOutlineDateBounds>) {
    const active = textFilterEnabled && textFilterQuery.trim().length > 0;
    return {
      pageSize,
      bounds,
      loadAll: active && !bounds,
      maxDaysBack: active && !bounds ? durationDays : undefined,
      textQuery: active ? textFilterQuery : undefined,
    };
  }

  async function resetAndLoad(date: Date, scrollToAnchor: boolean) {
    editingId = null;
    const generation = ++loadGeneration;
    loading = true;
    loadingMore = false;
    if (textSearchActive) days = [];
    const ctx = buildCalendarCtx(date, $calendarContext);
    const bounds = resolveOutlineDateBounds(rangeMode, ctx);
    const batchOpts = outlineBatchOptions(bounds);
    try {
      const [batch, headings] = await Promise.all([
        loadOutlineBatch(app, date, fallback, tagebuchSettings, outlineSettings, batchOpts),
        loadUsedJournalHeadings(app, date, fallback, tagebuchSettings, durationDays, {
          excludedHeadings,
          bounds,
        }),
      ]);
      if (generation !== loadGeneration) return;
      days = batch.days;
      usedHeadings = headings;
      hasMore = textSearchActive ? false : batch.hasMore;
    } catch (e) {
      if (generation !== loadGeneration) return;
      console.error("Universal Daily Note: Timeline", e);
      days = [];
      hasMore = false;
    } finally {
      if (generation === loadGeneration) loading = false;
    }

    if (scrollToAnchor && generation === loadGeneration) {
      await tick();
      scrollToDate(selectedDateKey(date));
    }
  }

  async function loadMore() {
    if (bounded || textSearchActive || loading || loadingMore || !hasMore || days.length === 0) return;
    const oldest = days[days.length - 1]?.dateKey;
    if (!oldest) return;

    loadingMore = true;
    const generation = loadGeneration;
    try {
      const batch = await loadOutlineBatch(app, $selectedDate, fallback, tagebuchSettings, outlineSettings, {
        pageSize,
        beforeDateKey: oldest,
      });
      if (generation !== loadGeneration) return;
      if (batch.days.length === 0) {
        hasMore = false;
        return;
      }
      days = [...days, ...batch.days];
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
    if (!listEl) return null;
    return listEl.closest(".dk-scrollHost") ?? listEl;
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

  function openDayNote(filePath: string) {
    void openTimelineEntry(app, filePath, 0);
  }

  function openWikiLink(dest: string, sourcePath: string, ev: MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    void openWikiLinkInMain(app, dest, sourcePath);
  }

  async function startEdit(day: TimelineDay, entry: TimelineEntry) {
    editingId = entryId(day, entry);
    editValue = entry.text;
    await tick();
    editInput?.focus();
    editInput?.select();
  }

  function cancelEdit() {
    editingId = null;
  }

  async function commitEdit(day: TimelineDay, entry: TimelineEntry) {
    if (editingId !== entryId(day, entry)) return;
    const trimmed = editValue.trim();
    editingId = null;
    if (!trimmed || trimmed === entry.text) return;

    const ok = await updateJournalLine(app, day.filePath, entry.line, entry.rawLine, trimmed);
    if (ok) store.refreshTick.update((n) => n + 1);
  }

  function onEntryDblClick(day: TimelineDay, entry: TimelineEntry, ev: MouseEvent) {
    ev.preventDefault();
    void startEdit(day, entry);
  }

  function onEditKeydown(day: TimelineDay, entry: TimelineEntry, ev: KeyboardEvent) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      void commitEdit(day, entry);
    } else if (ev.key === "Escape") {
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

  function openRangeMenu(ev: MouseEvent) {
    const modes: OutlineRangeMode[] = ["scroll", "month", "week"];
    const menu = new Menu();
    for (const mode of modes) {
      menu.addItem((item) => {
        item.setTitle(outlineRangeModeLabel(mode));
        item.setChecked(mode === rangeMode);
        item.onClick(() => selectRangeMode(mode));
      });
    }
    const target = ev.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
  }

  function onRangeFilterClick(ev: MouseEvent) {
    openRangeMenu(ev);
  }

  function selectHeading(heading: string) {
    if (heading === journalHeading) return;
    onOutlinePatch({ journalHeading: heading });
  }

  function openHeadingMenu(ev: MouseEvent) {
    if (dropdownHeadings.length <= 1) return;
    const menu = new Menu();
    for (const heading of dropdownHeadings) {
      menu.addItem((item) => {
        item.setTitle(heading);
        item.setChecked(heading === journalHeading);
        item.onClick(() => selectHeading(heading));
      });
    }
    const target = ev.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
  }

  function onHeadingFilterClick(ev: MouseEvent) {
    openHeadingMenu(ev);
  }

  function updateRangeButton() {
    if (!rangeIconEl) return;
    setIcon(rangeIconEl, "calendar");
    if (rangeBtn) {
      rangeBtn.setAttribute("aria-label", `Zeitraum: ${outlineRangeModeLabel(rangeMode)}`);
      rangeBtn.title = outlineRangeModeLabel(rangeMode);
    }
  }

  function updateHeadingButton() {
    if (!headingIconEl) return;
    setIcon(headingIconEl, "heading");
    if (headingBtn) {
      headingBtn.setAttribute("aria-label", `Überschrift: ${journalHeading}`);
      headingBtn.title = journalHeading;
    }
  }

  function updateDailyNoteButton() {
    if (!dailyNoteBtn) return;
    setIcon(dailyNoteBtn, "calendar-days");
    dailyNoteBtn.setAttribute("aria-label", "Tages-Composer");
    dailyNoteBtn.title = "Tages-Composer";
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
    updateHeadingButton();
    updateTimeToggleButton();
    updateDailyNoteButton();
  });

  onMount(() => {
    bindScrollHost();
    updateRangeButton();
    updateHeadingButton();
    updateTimeToggleButton();
    updateDailyNoteButton();
    return () => {
      scrollHost?.removeEventListener("scroll", onListScroll);
      scrollHost = null;
    };
  });
</script>

<div class="udn-timeline">
  <div class="udn-timelineHead">
    <button
      type="button"
      bind:this={rangeBtn}
      class="udn-headingFilter udn-headingFilter--menu"
      on:click={onRangeFilterClick}
    >
      <span class="udn-headingFilterIcon" bind:this={rangeIconEl} aria-hidden="true"></span>
      <span class="udn-headingFilterLabel">{outlineRangeModeLabel(rangeMode)}</span>
    </button>
    <button
      type="button"
      bind:this={headingBtn}
      class="udn-headingFilter"
      class:udn-headingFilter--menu={dropdownHeadings.length > 1}
      disabled={dropdownHeadings.length <= 1}
      on:click={onHeadingFilterClick}
    >
      <span class="udn-headingFilterIcon" bind:this={headingIconEl} aria-hidden="true"></span>
      <span class="udn-headingFilterLabel">{journalHeading}</span>
    </button>
    <FlexTextFilter
      mode="toggle"
      enabled={textFilterEnabled}
      query={textFilterQuery}
      onPatch={onOutlinePatch}
    />
    <button
      type="button"
      bind:this={timeToggleBtn}
      class={dk.iconRoundBtnToolbar}
      on:click={toggleShowTimeBubbles}
    ></button>
    <button
      type="button"
      bind:this={dailyNoteBtn}
      class={dk.iconRoundBtnToolbar}
      on:click={openDailyNote}
    ></button>
  </div>

  <FlexTextFilter
    mode="field"
    enabled={textFilterEnabled}
    query={textFilterQuery}
    onPatch={onOutlinePatch}
  />

  {#if loading && days.length === 0}
    <p class={dk.empty}>{textSearchActive ? "Suche Tagebuch…" : "Lade Tagebuch…"}</p>
  {:else if days.length === 0}
    <p class={dk.empty}>
      Keine Einträge ({journalHeading}{rangeMode !== "scroll" ? ` · ${outlineRangeModeLabel(rangeMode)}` : ""}).
    </p>
  {:else if displayDays.length === 0}
    <p class={dk.empty}>
      Keine Treffer für „{textFilterQuery.trim()}“ ({journalHeading}).
    </p>
  {:else}
    <div
      class="{dk.list} udn-timelineList"
      class:udn-timelineList--noTime={!showTimeBubbles}
      bind:this={listEl}
    >
      {#each displayDays as day, dayIndex (day.dateKey)}
        {@const isSelected = selectedDateKey($selectedDate) === day.dateKey}
        <div
          class="udn-timelineDay"
          class:udn-timelineDay--selected={isSelected}
          style="--ref-hue: {entryHueFromIndex(dayIndex)}"
          data-date-key={day.dateKey}
        >
          <div class="udn-timelineDayHead">
            <button type="button" class="udn-dateBubble" on:click={() => openDayNote(day.filePath)}>
              {formatDayBubbleLabel(day.label)}
            </button>
            <span class="udn-timelineDayCount">
              {day.entries.length === 1 ? "1 Eintrag" : `${day.entries.length} Einträge`}
            </span>
          </div>
          <div class="udn-timelineDayEntries">
            {#each day.entries as entry (day.dateKey + entry.line)}
              {@const display = parseJournalEntryDisplay(entry.text)}
              <div class="udn-outlineEntry">
                {#if editingId === entryId(day, entry)}
                  <input
                    type="text"
                    class="{dk.input} udn-timelineEntryEdit"
                    bind:value={editValue}
                    bind:this={editInput}
                    on:blur={() => commitEdit(day, entry)}
                    on:keydown={(ev) => onEditKeydown(day, entry, ev)}
                  />
                {:else}
                  {#if showTimeBubbles && display.time}
                    <span class="udn-timeBubble">{display.time}</span>
                  {/if}
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <span
                    class="udn-timelineEntryBody"
                    title="Doppelklick zum Bearbeiten"
                    on:dblclick={(ev) => onEntryDblClick(day, entry, ev)}
                  >
                    {#each parseWikiLinks(display.body) as seg, i (i + seg.kind + (seg.kind === "link" ? seg.dest : seg.value))}
                      {#if seg.kind === "link"}
                        <a
                          href="#"
                          class="internal-link"
                          on:click={(ev) => openWikiLink(seg.dest, day.filePath, ev)}
                        >{seg.label}</a>
                      {:else}{seg.value}{/if}
                    {/each}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
      {#if loadingMore}
        <p class="{dk.empty} udn-timelineMore">Lade weitere Tage…</p>
      {/if}
    </div>
  {/if}
</div>
