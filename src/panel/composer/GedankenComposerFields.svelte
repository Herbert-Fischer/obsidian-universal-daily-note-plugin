<script lang="ts">
  import type { App } from "obsidian";
  import MarkdownDetailField from "./MarkdownDetailField.svelte";

  export let app: App;
  export let sourcePath = "";
  export let thema = "";
  export let detail = "";
  export let themaOptions: string[] = [];
  export let onAddThemaOption: (value: string) => void = () => {};
  export let onHideThemaOption: (value: string) => void = () => {};
  export let onThemaChange: (value: string) => void = () => {};
  export let onDetailChange: (value: string) => void = () => {};
  export let onFocus: (el: HTMLElement) => void = () => {};

  function focusTarget(ev: Event): void {
    onFocus(ev.currentTarget as HTMLElement);
  }
</script>

<div class="udn-wandernForm udn-gedankenForm">
  <MarkdownDetailField
    {app}
    {sourcePath}
    value={detail}
    ariaLabel="Erläuterung"
    placeholder="Markdown: **fett**, *kursiv*, - Listen, [[Links]]…"
    showAssignment={true}
    assignment={thema}
    assignmentOptions={themaOptions}
    assignmentPlaceholder="Thema (optional)"
    assignmentAriaLabel="Thema zuordnen"
    assignmentMenuLabel="Thema wählen oder verwalten"
    onAssignmentChange={onThemaChange}
    onAddAssignmentOption={onAddThemaOption}
    onHideAssignmentOption={onHideThemaOption}
    onValueChange={onDetailChange}
    onFocus={focusTarget}
  />
</div>
