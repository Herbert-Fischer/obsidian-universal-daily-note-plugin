<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import type UniversalDailyNotePlugin from "../main";
  import { DEFAULT_SETTINGS, type OutlineSettings } from "../settings";
  import {
    dateFromDailyNoteFile,
    getUniversalCalendarContext,
    isUniversalCalendarPanelSyncEnabled,
    isUniversalCalendarSuppressingEcho,
    syncUniversalCalendarFromContext,
  } from "../integrations/universalCalendar";
  import type { CalendarSyncContext } from "../integrations/calendarRange";
  import { bumpRefresh, createPanelStore, type PanelStore } from "./panelStore";
  import { normalizeLocalDay, sameLocalDay } from "./dateUtils";
  import { getMainAreaActiveMarkdownFile } from "../tagebuchVerweise/mainPageFile";
  import TimelineSection from "./sections/TimelineSection.svelte";
  import { openDailyComposer } from "./composer/openDailyComposer";
  import { openUniversalTaskComposer } from "../integrations/universalTasks";
  import { runInsertWeather } from "../weather/runInsertWeather";
  import { Notice } from "obsidian";

  export let app: UniversalDailyNotePlugin["app"];
  export let plugin: UniversalDailyNotePlugin;
  export let onStoreReady: (
    store: PanelStore,
    setSelectedDate: (d: Date) => void,
    setCalendarContext: (ctx: CalendarSyncContext) => void,
  ) => void;

  const calCtx = getUniversalCalendarContext(app);
  const initialDate = calCtx?.selectedDate ?? new Date();
  const store = createPanelStore(initialDate, plugin.settings);
  const { selectedDate, calendarContext } = store;
  let outlineSettings: OutlineSettings = plugin.settings.outline ?? DEFAULT_SETTINGS.outline;
  let syncingFromCalendar = false;
  /** Outline day picked by user; not overwritten by unrelated active daily note. */
  let outlinePinnedDate: Date | null = null;

  function patchOutline(patch: Partial<OutlineSettings>) {
    outlineSettings = { ...outlineSettings, ...patch };
    plugin.settings = {
      ...plugin.settings,
      outline: outlineSettings,
    };
    void plugin.saveSettings();
    bumpRefresh(store);
  }

  function pushToUniversalCalendar(date: Date, monthCursor?: Date): void {
    if (!isUniversalCalendarPanelSyncEnabled(app)) return;
    const month = monthCursor ?? new Date(date.getFullYear(), date.getMonth(), 1);
    syncUniversalCalendarFromContext(app, {
      selectedDate: normalizeLocalDay(date),
      monthCursor: normalizeLocalDay(month),
    });
  }

  function applyPanelContext(ctx: CalendarSyncContext, fromCalendar: boolean): void {
    const normalized: CalendarSyncContext = {
      selectedDate: normalizeLocalDay(ctx.selectedDate),
      monthCursor: normalizeLocalDay(ctx.monthCursor),
    };
    if (fromCalendar) {
      syncingFromCalendar = true;
      outlinePinnedDate = null;
    }
    calendarContext.set(normalized);
    selectedDate.set(normalized.selectedDate);
    if (fromCalendar) syncingFromCalendar = false;
    else if (!syncingFromCalendar) {
      pushToUniversalCalendar(normalized.selectedDate, normalized.monthCursor);
    }
  }

  function setSelectedDate(date: Date): void {
    const normalized = normalizeLocalDay(date);
    const monthCursor = new Date(normalized.getFullYear(), normalized.getMonth(), 1);
    calendarContext.set({ selectedDate: normalized, monthCursor });
    selectedDate.set(normalized);
    if (!syncingFromCalendar) pushToUniversalCalendar(normalized, monthCursor);
  }

  function setCalendarContext(ctx: CalendarSyncContext): void {
    applyPanelContext(ctx, true);
  }

  function syncFromCalendar() {
    const ctx = getUniversalCalendarContext(app);
    if (ctx) applyPanelContext(ctx, true);
  }

  function syncFromActiveContext() {
    if (syncingFromCalendar || isUniversalCalendarSuppressingEcho(app)) return;

    const active = getMainAreaActiveMarkdownFile(app);
    if (active) {
      const noteDate = dateFromDailyNoteFile(
        active,
        plugin.settings.dailyNoteFallback,
        plugin.settings.tagebuchVerweise,
      );
      if (noteDate) {
        const normalized = normalizeLocalDay(noteDate);
        if (outlinePinnedDate) {
          if (sameLocalDay(outlinePinnedDate, normalized)) return;
          outlinePinnedDate = null;
        }
        const current = normalizeLocalDay(get(selectedDate));
        if (!sameLocalDay(current, noteDate)) {
          setSelectedDate(noteDate);
        } else if (!syncingFromCalendar) {
          pushToUniversalCalendar(
            noteDate,
            new Date(noteDate.getFullYear(), noteDate.getMonth(), 1),
          );
        }
        return;
      }
    }
    syncFromCalendar();
  }

  function selectOutlineDay(dateKey: string): void {
    const [y, m, d] = dateKey.split("-").map(Number);
    if (!y || !m || !d) return;
    outlinePinnedDate = normalizeLocalDay(new Date(y, m - 1, d));
    setSelectedDate(outlinePinnedDate);
  }

  onMount(() => {
    onStoreReady(store, setSelectedDate, setCalendarContext);
    syncFromActiveContext();

    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSyncFromActiveContext = () => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        syncTimer = null;
        syncFromActiveContext();
      }, 50);
    };

    const onLeafChange = () => scheduleSyncFromActiveContext();
    const onDataChange = () => bumpRefresh(store);
    const onVaultReady = () => bumpRefresh(store);

    const workspaceRef = app.workspace.on("active-leaf-change", onLeafChange);
    const layoutRef = app.workspace.on("layout-change", scheduleSyncFromActiveContext);
    const metaRef = app.metadataCache.on("changed", onDataChange);
    const resolvedRef = app.metadataCache.on("resolved", onVaultReady);
    const vaultRefs = [
      app.vault.on("create", onDataChange),
      app.vault.on("delete", onDataChange),
      app.vault.on("rename", onDataChange),
    ];

    app.workspace.onLayoutReady(onVaultReady);

    return () => {
      if (syncTimer) clearTimeout(syncTimer);
      app.workspace.offref(workspaceRef);
      app.workspace.offref(layoutRef);
      app.metadataCache.offref(metaRef);
      app.metadataCache.offref(resolvedRef);
      for (const ref of vaultRefs) {
        app.vault.offref(ref);
      }
    };
  });
</script>

<div class="udn-outline">
  <TimelineSection
    {app}
    {store}
    {selectedDate}
    fallback={plugin.settings.dailyNoteFallback}
    tagebuchSettings={plugin.settings.tagebuchVerweise}
    {outlineSettings}
    onOutlinePatch={patchOutline}
    onSelectDay={selectOutlineDay}
    onOpenComposer={(d) => {
      openDailyComposer(plugin, {
        date: d,
        journalHeading: outlineSettings.journalHeading,
        onSaved: () => bumpRefresh(store),
        onHeadingChange: (heading) => {
          patchOutline({ journalHeading: heading });
        },
      });
    }}
    onOpenTaskComposer={(d) => {
      const ok = openUniversalTaskComposer(app, d, () => bumpRefresh(store));
      if (!ok) {
        new Notice("Neue Aufgabe benötigt das Plugin „Universal Tasks“.");
      }
    }}
    onInsertWeather={async (d) => {
      const ok = await runInsertWeather(plugin, d, outlineSettings.journalHeading);
      if (ok) bumpRefresh(store);
    }}
  />
</div>
