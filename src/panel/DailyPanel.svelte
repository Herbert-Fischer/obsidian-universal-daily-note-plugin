<script lang="ts">
  import { onMount } from "svelte";
  import type UniversalDailyNotePlugin from "../main";
  import type { OutlineSettings } from "../settings";
  import { getUniversalCalendarContext } from "../integrations/universalCalendar";
  import type { CalendarSyncContext } from "../integrations/calendarRange";
  import { bumpRefresh, createPanelStore, type PanelStore } from "./panelStore";
  import { normalizeLocalDay } from "./dateUtils";
  import TimelineSection from "./sections/TimelineSection.svelte";
  import { openDailyComposer } from "./composer/openDailyComposer";

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

  function patchOutline(patch: Partial<OutlineSettings>) {
    plugin.settings = {
      ...plugin.settings,
      outline: { ...plugin.settings.outline, ...patch },
    };
    void plugin.saveSettings();
    bumpRefresh(store);
  }

  function setSelectedDate(date: Date): void {
    selectedDate.set(normalizeLocalDay(date));
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

  onMount(() => {
    onStoreReady(store, setSelectedDate, setCalendarContext);
    syncFromCalendar();

    const onLeafChange = () => syncFromCalendar();
    const onDataChange = () => bumpRefresh(store);
    const onVaultReady = () => bumpRefresh(store);

    const workspaceRef = app.workspace.on("active-leaf-change", onLeafChange);
    const layoutRef = app.workspace.on("layout-change", syncFromCalendar);
    const metaRef = app.metadataCache.on("changed", onDataChange);
    const resolvedRef = app.metadataCache.on("resolved", onVaultReady);
    const vaultRefs = [
      app.vault.on("create", onDataChange),
      app.vault.on("delete", onDataChange),
      app.vault.on("rename", onDataChange),
    ];

    app.workspace.onLayoutReady(onVaultReady);

    return () => {
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
    outlineSettings={plugin.settings.outline}
    onOutlinePatch={patchOutline}
    onOpenComposer={(d) => {
      openDailyComposer(plugin, {
        date: d,
        onSaved: () => bumpRefresh(store),
      });
    }}
  />
</div>
