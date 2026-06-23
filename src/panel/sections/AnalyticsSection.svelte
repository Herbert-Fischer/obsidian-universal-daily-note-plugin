<script lang="ts">
  import type { App } from "obsidian";
  import { dk } from "@denkarium/obsidian-lib-ui";
  import type { Writable } from "svelte/store";
  import type { DailyNoteFallbackSettings } from "../../settings";
  import { computeDailyAnalytics } from "../../notes/analytics";
  import type { PanelStore } from "../panelStore";

  export let app: App;
  export let store: PanelStore;
  export let selectedDate: Writable<Date>;
  export let fallback: DailyNoteFallbackSettings;
  export let dailyNotesFolder: string;

  const { refreshTick } = store;

  $: {
    void $refreshTick;
    stats = computeDailyAnalytics(app, fallback, $selectedDate, dailyNotesFolder);
  }

  let stats = computeDailyAnalytics(app, fallback, new Date(), dailyNotesFolder);
</script>

<div class="udn-stats">
  <div class={dk.statRow}>
    <span class={dk.statLabel}>Daily Notes gesamt</span>
    <span class={dk.statValue}>{stats.totalNotes}</span>
  </div>
  <div class={dk.statRow}>
    <span class={dk.statLabel}>Dieser Monat</span>
    <span class={dk.statValue}>{stats.monthCount}</span>
  </div>
  <div class={dk.statRow}>
    <span class={dk.statLabel}>Streak (bis heute)</span>
    <span class={dk.statValue}>{stats.streakDays}</span>
  </div>
</div>
