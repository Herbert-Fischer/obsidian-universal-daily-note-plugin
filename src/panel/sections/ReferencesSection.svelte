<script lang="ts">
  import { afterUpdate, onMount } from "svelte";
  import type { App } from "obsidian";
  import { Menu, setIcon, TFile } from "obsidian";
  import { dk, sidebarMenuAction, sidebarPointerAction } from "@denkarium/obsidian-lib-ui";
  import { panelTapAction } from "../panelTapAction";
  import type { Writable } from "svelte/store";
  import type {
    DailyNoteFallbackSettings,
    OutlineSettings,
    TagebuchVerweiseSettings,
  } from "../../settings";
  import { DEFAULT_JOURNAL_HEADING, DEFAULT_SETTINGS } from "../../settings";
  import { loadUsedJournalHeadings } from "../../notes/dailyNoteTimeline";
  import { findTagebuchVerweise, type TagebuchVerweisEntry } from "../../tagebuchVerweise/tagebuchVerweise";
  import { formatTargetPageLabel } from "../../tagebuchVerweise/mainPageFile";
  import { openPathInMainPane, openWikiLinkInMain } from "../../notes/openInMainPane";
  import { parseJournalLinks } from "../../notes/parseJournalLinks";
  import { parseJournalEntryDisplay } from "../../notes/parseJournalEntryDisplay";
  import { entryHueFromIndex, formatDayBubbleLabel } from "../formatDayBubble";
  import type { PanelStore } from "../panelStore";
  import type { CalendarSyncContext, OutlineRangeMode } from "../../integrations/calendarRange";
  import { outlineRangeModeLabel, resolveOutlineDateBounds } from "../../integrations/calendarRange";
  import { filterLinesByText } from "../../notes/entryTextFilter";
  import { ALL_JOURNAL_HEADINGS, isAllJournalHeadings } from "../../notes/journalHeadingFilter";
  import { readDailyNoteSummary } from "../../notes/dailyNoteSummary";
  import FlexTextFilter from "./FlexTextFilter.svelte";

  type RefDayGroup = {
    dateKey: string;
    filePath: string;
    label: string;
    summary: string;
    entries: TagebuchVerweisEntry[];
  };

  export let app: App;
  export let store: PanelStore;
  export let activeFile: Writable<TFile | null>;
  export let selectedDate: Writable<Date>;
  export let fallback: DailyNoteFallbackSettings;
  export let tagebuchSettings: TagebuchVerweiseSettings;
  export let outlineSettings: OutlineSettings = DEFAULT_SETTINGS.outline;
  export let onOutlinePatch: (patch: Partial<OutlineSettings>) => void = () => {};
  export let followMainPage: boolean;
  export let pinnedTarget: TFile | null;
  export let showTimeBubbles = false;
  export let onToggleFollowMainPage: () => void = () => {};
  export let onToggleShowTimeBubbles: () => void = () => {};

  const { refreshTick, calendarContext } = store;

  let entries: TagebuchVerweisEntry[] = [];
  let usedHeadings: string[] = [];
  let loading = false;
  let emptyMessage = "";
  let targetLabel = "";
  let timeToggleBtn: HTMLButtonElement;
  let refSelectBtn: HTMLButtonElement;
  let rangeBtn: HTMLButtonElement;
  let rangeIconEl: HTMLSpanElement;
  let headingBtn: HTMLButtonElement;
  let headingIconEl: HTMLSpanElement;
  let lastLoadSignature = "";
  let loadGeneration = 0;

  $: refreshKey = $refreshTick;
  $: noteDate = $selectedDate;
  $: targetFile = followMainPage ? $activeFile : pinnedTarget;
  $: rangeMode = outlineSettings?.rangeMode ?? "scroll";
  $: textFilterEnabled = outlineSettings?.textFilterEnabled ?? false;
  $: textFilterQuery = outlineSettings?.textFilterQuery ?? "";
  $: journalHeading = outlineSettings?.journalHeading ?? DEFAULT_JOURNAL_HEADING;
  $: excludedHeadings = outlineSettings?.excludedHeadings ?? [];
  $: durationDays = Math.max(1, outlineSettings?.durationDays ?? 365);
  $: calCtx = buildCalendarCtx(noteDate, $calendarContext);
  $: dateBounds = resolveOutlineDateBounds(rangeMode, calCtx);
  $: baselineHeadings =
    usedHeadings.length > 0
      ? usedHeadings
      : isAllJournalHeadings(journalHeading)
        ? [DEFAULT_JOURNAL_HEADING]
        : [journalHeading];
  $: dropdownHeadings =
    baselineHeadings.some((h) => h.toLowerCase() === journalHeading.toLowerCase())
      ? baselineHeadings
      : isAllJournalHeadings(journalHeading)
        ? baselineHeadings
        : [journalHeading, ...baselineHeadings];
  $: showSectionLabels = isAllJournalHeadings(journalHeading);
  $: headingMenuItems = [
    ALL_JOURNAL_HEADINGS,
    ...dropdownHeadings.filter((h) => !isAllJournalHeadings(h)),
  ];
  $: filteredEntries = filterLinesByText(
    entries,
    textFilterEnabled ? textFilterQuery : "",
  );
  $: dayGroups = groupEntriesByDay(filteredEntries);
  $: loadSignature = buildLoadSignature(
    rangeMode,
    journalHeading,
    targetFile?.path ?? "",
    calCtx,
    refreshKey,
  );

  $: if (loadSignature !== lastLoadSignature) {
    lastLoadSignature = loadSignature;
    void reload(targetFile);
  }

  function buildCalendarCtx(date: Date, ctx: CalendarSyncContext | null): CalendarSyncContext {
    const selected = ctx?.selectedDate ?? date;
    const normalized = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), 0, 0, 0, 0);
    const monthCursor = ctx?.monthCursor ?? new Date(normalized.getFullYear(), normalized.getMonth(), 1);
    return { selectedDate: normalized, monthCursor };
  }

  function buildLoadSignature(
    mode: OutlineRangeMode,
    heading: string,
    targetPath: string,
    ctx: CalendarSyncContext,
    refresh: number,
  ): string {
    const bounds = resolveOutlineDateBounds(mode, ctx);
    const boundsPart = bounds ? `${bounds.startDateKey}:${bounds.endDateKey}` : "scroll";
    return `${targetPath}|${mode}|${boundsPart}|${heading}|${refresh}`;
  }

  function summaryForDailyNotePath(filePath: string): string {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return "";
    try {
      return readDailyNoteSummary(app, file);
    } catch {
      return "";
    }
  }

  function groupEntriesByDay(rows: TagebuchVerweisEntry[]): RefDayGroup[] {
    const groups: RefDayGroup[] = [];
    const indexByPath = new Map<string, number>();
    for (const row of rows) {
      const i = indexByPath.get(row.dailyNotePath);
      if (i == null) {
        indexByPath.set(row.dailyNotePath, groups.length);
        groups.push({
          dateKey: row.dailyNoteLabel,
          filePath: row.dailyNotePath,
          label: row.dailyNoteLabel,
          summary: summaryForDailyNotePath(row.dailyNotePath),
          entries: [row],
        });
      } else {
        groups[i]!.entries.push(row);
      }
    }
    return groups;
  }

  function refCountLabel(count: number): string {
    return count === 1 ? "1 Verweis" : `${count} Verweise`;
  }

  async function reload(file: TFile | null) {
    const generation = ++loadGeneration;
    targetLabel = file ? formatTargetPageLabel(file) : "";
    if (!file) {
      entries = [];
      usedHeadings = [];
      emptyMessage = followMainPage
        ? "Keine Markdown-Hauptseite geöffnet."
        : "Keine Zielseite fixiert.";
      loading = false;
      return;
    }

    loading = true;
    const ctx = buildCalendarCtx(noteDate, $calendarContext);
    const bounds = resolveOutlineDateBounds(rangeMode, ctx);
    try {
      const [rows, headings] = await Promise.all([
        findTagebuchVerweise(app, file, tagebuchSettings, {
          journalHeading,
          startDateKey: bounds?.startDateKey ?? null,
          endDateKey: bounds?.endDateKey ?? null,
        }),
        loadUsedJournalHeadings(app, noteDate, fallback, tagebuchSettings, durationDays, {
          excludedHeadings,
          bounds,
        }),
      ]);
      if (generation !== loadGeneration) return;
      entries = rows;
      usedHeadings = headings;
      const rangeHint = rangeMode !== "scroll" ? ` · ${outlineRangeModeLabel(rangeMode)}` : "";
      emptyMessage =
        rows.length === 0
          ? `Keine Verweise auf ${targetLabel} (${journalHeading}${rangeHint}).`
          : "";
    } catch (e) {
      if (generation !== loadGeneration) return;
      console.error("Universal Daily Note: Tagebuch-Verweise", e);
      entries = [];
      usedHeadings = [];
      emptyMessage = "Fehler beim Laden der Verweise.";
    } finally {
      if (generation === loadGeneration) loading = false;
    }
  }

  function openDayNote(filePath: string) {
    void openPathInMainPane(app, filePath, 0);
  }

  function openWikiLink(dest: string, sourcePath: string) {
    void openWikiLinkInMain(app, dest, sourcePath);
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

  function selectHeading(heading: string) {
    if (heading === journalHeading) return;
    onOutlinePatch({ journalHeading: heading });
  }

  function openHeadingMenu() {
    if (headingMenuItems.length <= 1 || !headingBtn) return;
    const menu = new Menu();
    for (const heading of headingMenuItems) {
      menu.addItem((item) => {
        item.setTitle(heading);
        item.setChecked(heading === journalHeading);
        item.onClick(() => selectHeading(heading));
      });
    }
    const rect = headingBtn.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
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
      headingBtn.setAttribute("aria-label", `Abschnitt: ${journalHeading}`);
      headingBtn.title = journalHeading;
    }
  }

  function updateRefSelectButton() {
    if (!refSelectBtn) return;
    setIcon(refSelectBtn, "locate-fixed");
    refSelectBtn.classList.toggle(dk.iconRoundBtnActive, followMainPage);
    refSelectBtn.setAttribute(
      "aria-label",
      followMainPage
        ? "Hauptseite folgen: an — Klicken zum Fixieren"
        : "Hauptseite folgen: aus — Klicken zum Übernehmen der Hauptseite",
    );
    refSelectBtn.setAttribute("aria-pressed", followMainPage ? "true" : "false");
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
    updateRangeButton();
    updateHeadingButton();
    updateRefSelectButton();
    updateTimeToggleButton();
  });

  onMount(() => {
    updateRangeButton();
    updateHeadingButton();
    updateRefSelectButton();
    updateTimeToggleButton();
  });
</script>

<div class="udn-refPanel">
  <div class="udn-timelineToolbar">
    <div class="udn-timelineHead">
      <div class="udn-timelineHeadFilters">
        <button
          type="button"
          bind:this={rangeBtn}
          class="udn-headingFilter udn-headingFilter--menu"
          use:sidebarMenuAction={openRangeMenu}
        >
          <span class="udn-headingFilterIcon" bind:this={rangeIconEl} aria-hidden="true"></span>
          <span class="udn-headingFilterLabel">{outlineRangeModeLabel(rangeMode)}</span>
        </button>
        <button
          type="button"
          bind:this={headingBtn}
          class="udn-headingFilter udn-headingFilter--journal"
          class:udn-headingFilter--menu={headingMenuItems.length > 1}
          disabled={headingMenuItems.length <= 1}
          use:sidebarMenuAction={openHeadingMenu}
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
      </div>
      <div class="udn-timelineHeadActions">
        <button
          type="button"
          bind:this={timeToggleBtn}
          class={dk.iconRoundBtnToolbar}
          use:panelTapAction={onToggleShowTimeBubbles}
        ></button>
        <button
          type="button"
          bind:this={refSelectBtn}
          class={dk.iconRoundBtnToolbar}
          use:panelTapAction={onToggleFollowMainPage}
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

  <div class="udn-timelineBody">
  {#if loading}
    <p class="{dk.empty} udn-refEmpty">Lade Verweise…</p>
  {:else if emptyMessage}
    <p class="{dk.empty} udn-refEmpty">{emptyMessage}</p>
  {:else if dayGroups.length === 0 && entries.length > 0}
    <p class="{dk.empty} udn-refEmpty">Keine Treffer für „{textFilterQuery.trim()}“.</p>
  {:else}
    <div
      class="{dk.list} udn-timelineList udn-refList"
      class:udn-timelineList--noTime={!showTimeBubbles}
    >
      {#each dayGroups as day, dayIndex (day.filePath)}
        <div
          class="udn-timelineDay"
          style="--ref-hue: {entryHueFromIndex(dayIndex)}"
          data-date-key={day.dateKey}
        >
          <div class="udn-timelineDayHead">
            <button type="button" class="udn-dateBubble" use:panelTapAction={() => openDayNote(day.filePath)}>
              {formatDayBubbleLabel(day.label)}
            </button>
            {#if day.summary}
              <span class="udn-timelineDaySummary" title={day.summary}>{day.summary}</span>
            {/if}
            <span class="udn-timelineDayCount">{refCountLabel(day.entries.length)}</span>
          </div>
          <div class="udn-timelineDayEntries">
            {#each day.entries as entry (day.filePath + entry.sourceLine + entry.line)}
              {@const display = parseJournalEntryDisplay(entry.line)}
              <div class="udn-outlineEntry">
                {#if showTimeBubbles && display.time}
                  <span class="udn-timeBubble">{display.time}</span>
                {/if}
                <span class="udn-timelineEntryBody">
                  {#if showSectionLabels && entry.section}
                    <span class="udn-entrySectionInline">{entry.section} · </span>
                  {/if}
                  {#each parseJournalLinks(display.body) as seg, si (si + seg.kind + (seg.kind === "text" ? seg.value : seg.kind === "wiki" ? seg.dest : seg.href))}
                    {#if seg.kind === "wiki"}
                      <a
                        href="#"
                        class="internal-link"
                        use:sidebarPointerAction={() => openWikiLink(seg.dest, entry.dailyNotePath)}
                      >{seg.label}</a>
                    {:else if seg.kind === "url"}
                      <a
                        href={seg.href}
                        class="external-link"
                        target="_blank"
                        rel="noopener noreferrer"
                      >{seg.label}</a>
                    {:else}{seg.value}{/if}
                  {/each}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
  </div>
</div>
