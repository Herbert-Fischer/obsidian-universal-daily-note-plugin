<script lang="ts">
  import { afterUpdate, onMount } from "svelte";
  import { setIcon } from "obsidian";
  import { dk, sidebarPointerAction } from "@denkarium/obsidian-lib-ui";
  import type { SectionId } from "../settings";

  export let sectionId: SectionId;
  export let title: string;
  export let collapsed: boolean;
  export let scroll = false;
  export let onToggle: (id: SectionId) => void;

  let chevronEl: HTMLSpanElement;

  function updateChevron() {
    if (!chevronEl) return;
    setIcon(chevronEl, collapsed ? "chevron-right" : "chevron-down");
  }

  afterUpdate(updateChevron);
  onMount(updateChevron);

  function handleToggle() {
    onToggle(sectionId);
  }
</script>

<section
  class="{dk.section} {collapsed ? dk.sectionCollapsed : ''} {scroll ? dk.sectionScroll : ''}"
  aria-labelledby="udn-section-{sectionId}"
>
  <button
    type="button"
    id="udn-section-{sectionId}"
    class={dk.sectionHeader}
    aria-expanded={!collapsed}
    use:sidebarPointerAction={handleToggle}
  >
    <span class={dk.sectionChevron} bind:this={chevronEl}></span>
    <span>{title}</span>
  </button>
  {#if !collapsed}
    <div class={dk.sectionBody}>
      <slot />
    </div>
  {/if}
</section>
