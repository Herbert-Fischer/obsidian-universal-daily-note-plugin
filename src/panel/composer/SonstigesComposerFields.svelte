<script lang="ts">
  import type { App } from "obsidian";
  import MarkdownDetailField from "./MarkdownDetailField.svelte";

  export let app: App;
  export let sourcePath = "";
  export let detail = "";
  export let showReise = false;
  export let reise = "";
  export let reiseOptions: string[] = [];
  export let onReiseChange: (value: string) => void = () => {};
  export let onAddReiseOption: (value: string) => void = () => {};
  export let onHideReiseOption: (value: string) => void = () => {};
  export let onDetailChange: (value: string) => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

  function focusTarget(ev: Event): void {
    onFocus(ev.currentTarget as HTMLElement);
  }
</script>

<div class="udn-wandernForm udn-sonstigesForm">
  <MarkdownDetailField
    {app}
    {sourcePath}
    value={detail}
    ariaLabel="Erläuterung im Callout"
    placeholder="Markdown: **fett**, *kursiv*, - Listen, [[Links]]…"
    showAssignment={showReise}
    assignment={reise}
    assignmentOptions={reiseOptions}
    assignmentPlaceholder="Zuordnung (optional)"
    assignmentAriaLabel="Zuordnung (optional)"
    assignmentMenuLabel="Zuordnung wählen oder verwalten"
    onAssignmentChange={onReiseChange}
    onAddAssignmentOption={onAddReiseOption}
    onHideAssignmentOption={onHideReiseOption}
    onValueChange={onDetailChange}
    onFocus={focusTarget}
  />
</div>
