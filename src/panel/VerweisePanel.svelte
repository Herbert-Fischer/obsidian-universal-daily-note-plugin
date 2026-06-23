<script lang="ts">
  import { onMount } from "svelte";
  import type { TFile } from "obsidian";
  import type UniversalDailyNotePlugin from "../main";
  import type { OutlineSettings, TagebuchVerweiseSettings } from "../settings";
  import { getUniversalCalendarContext } from "../integrations/universalCalendar";
  import type { CalendarSyncContext } from "../integrations/calendarRange";
  import { getMainAreaActiveMarkdownFile } from "../tagebuchVerweise/mainPageFile";
  import { bumpRefresh, createPanelStore, type PanelStore } from "./panelStore";
  import { normalizeLocalDay } from "./dateUtils";
  import ReferencesSection from "./sections/ReferencesSection.svelte";

  export let app: UniversalDailyNotePlugin["app"];
  export let plugin: UniversalDailyNotePlugin;

  const calCtx = getUniversalCalendarContext(app);
  const initialDate = calCtx?.selectedDate ?? new Date();
  const store = createPanelStore(initialDate, plugin.settings);
  const { activeFile, selectedDate, calendarContext } = store;

  let followMainPage = true;
  let pinnedTarget: TFile | null = null;

  $: showTimeBubbles = plugin.settings.tagebuchVerweise.showTimeBubbles ?? false;

  function patchOutline(patch: Partial<OutlineSettings>) {
    plugin.settings = {
      ...plugin.settings,
      outline: { ...plugin.settings.outline, ...patch },
    };
    void plugin.saveSettings();
    bumpRefresh(store);
  }

  function patchVerweise(patch: Partial<TagebuchVerweiseSettings>) {
    plugin.settings = {
      ...plugin.settings,
      tagebuchVerweise: { ...plugin.settings.tagebuchVerweise, ...patch },
    };
    void plugin.saveSettings();
    bumpRefresh(store);
  }

  function setCalendarContext(ctx: CalendarSyncContext): void {
    const normalized: CalendarSyncContext = {
      selectedDate: normalizeLocalDay(ctx.selectedDate),
      monthCursor: normalizeLocalDay(ctx.monthCursor),
    };
    calendarContext.set(normalized);
    selectedDate.set(normalized.selectedDate);
    bumpRefresh(store);
  }

  function syncFromCalendar() {
    const ctx = getUniversalCalendarContext(app);
    if (ctx) setCalendarContext(ctx);
  }

  function toggleShowTimeBubbles() {
    patchVerweise({ showTimeBubbles: !showTimeBubbles });
  }

  function toggleFollowMainPage() {
    if (followMainPage) {
      pinnedTarget = getMainAreaActiveMarkdownFile(app) ?? pinnedTarget;
      followMainPage = false;
    } else {
      followMainPage = true;
      pinnedTarget = null;
    }
    bumpRefresh(store);
  }

  function refreshActiveFile() {
    activeFile.set(getMainAreaActiveMarkdownFile(app));
    bumpRefresh(store);
  }

  onMount(() => {
    syncFromCalendar();
    refreshActiveFile();

    const onLeafChange = () => {
      refreshActiveFile();
      syncFromCalendar();
    };
    const onDataChange = () => bumpRefresh(store);

    const workspaceRef = app.workspace.on("active-leaf-change", onLeafChange);
    const layoutRef = app.workspace.on("layout-change", syncFromCalendar);
    const metaRef = app.metadataCache.on("changed", onDataChange);
    const vaultRefs = [
      app.vault.on("create", onDataChange),
      app.vault.on("delete", onDataChange),
      app.vault.on("rename", onDataChange),
    ];

    return () => {
      app.workspace.offref(workspaceRef);
      app.workspace.offref(layoutRef);
      app.metadataCache.offref(metaRef);
      for (const ref of vaultRefs) {
        app.vault.offref(ref);
      }
    };
  });
</script>

<div class="udn-verweise">
  <ReferencesSection
    {app}
    {store}
    {activeFile}
    {selectedDate}
    fallback={plugin.settings.dailyNoteFallback}
    tagebuchSettings={plugin.settings.tagebuchVerweise}
    outlineSettings={plugin.settings.outline}
    onOutlinePatch={patchOutline}
    {followMainPage}
    {pinnedTarget}
    {showTimeBubbles}
    onToggleFollowMainPage={toggleFollowMainPage}
    onToggleShowTimeBubbles={toggleShowTimeBubbles}
  />
</div>
