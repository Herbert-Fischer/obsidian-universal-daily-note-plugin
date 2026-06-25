<script lang="ts">
  import { afterUpdate, onMount } from "svelte";
  import { setIcon } from "obsidian";
  import { dk, sidebarPointerAction } from "@denkarium/obsidian-lib-ui";
  import type { OutlineSettings } from "../../settings";

  export let mode: "toggle" | "field";
  export let enabled = false;
  export let query = "";
  export let onPatch: (patch: Partial<Pick<OutlineSettings, "textFilterEnabled" | "textFilterQuery">>) => void =
    () => {};

  let toggleBtn: HTMLButtonElement;
  let toggleIconEl: HTMLSpanElement;
  let clearBtn: HTMLButtonElement;
  let clearIconEl: HTMLSpanElement;

  function toggle() {
    onPatch({ textFilterEnabled: !enabled });
  }

  function onInput(ev: Event) {
    onPatch({ textFilterQuery: (ev.currentTarget as HTMLInputElement).value });
  }

  function clearQuery() {
    onPatch({ textFilterQuery: "" });
  }

  function updateToggle() {
    if (mode !== "toggle" || !toggleIconEl) return;
    setIcon(toggleIconEl, "text-select");
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-label", enabled ? "Textfilter: an" : "Textfilter");
      toggleBtn.title = "Textfilter";
    }
  }

  function updateClear() {
    if (mode !== "field" || !clearIconEl) return;
    setIcon(clearIconEl, "x");
    if (clearBtn) {
      clearBtn.setAttribute("aria-label", "Suchbegriff löschen");
      clearBtn.title = "Löschen";
    }
  }

  afterUpdate(() => {
    updateToggle();
    updateClear();
  });
  onMount(() => {
    updateToggle();
    updateClear();
  });
</script>

{#if mode === "toggle"}
  <button
    type="button"
    bind:this={toggleBtn}
    class="udn-headingFilter udn-headingFilter--menu"
    class:udn-headingFilter--active={enabled}
    use:sidebarPointerAction={toggle}
  >
    <span class="udn-headingFilterIcon" bind:this={toggleIconEl} aria-hidden="true"></span>
  </button>
{:else if enabled}
  <div class="udn-textFilterRow">
    <div class="udn-textFilterWrap">
      <input
        type="search"
        class="{dk.input} udn-textFilterInput"
        placeholder="z. B. Mittagessen:"
        value={query}
        on:input={onInput}
        aria-label="Textfilter"
      />
      {#if query.trim()}
        <button type="button" bind:this={clearBtn} class="udn-textFilterClear" use:sidebarPointerAction={clearQuery}>
          <span bind:this={clearIconEl} aria-hidden="true"></span>
        </button>
      {/if}
    </div>
  </div>
{/if}
