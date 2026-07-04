<script lang="ts">
  import type { FeedProfile } from "../notes/feedMetadata";
  import { profileBubbleClass, profileLetter } from "../notes/journalEntryMeta";

  export let profile: FeedProfile | undefined = undefined;
  export let title = "Profil zuweisen";
  export let onClick: ((ev: MouseEvent) => void) | undefined = undefined;

  $: letter = profileLetter(profile);
  $: colorClass = profileBubbleClass(profile);
</script>

<button
  type="button"
  class="udn-profileBubble udn-feedLinkBubble {colorClass}"
  class:udn-profileBubble--empty={!letter}
  {title}
  aria-label={title}
  on:click={onClick}
>
  {letter || "·"}
</button>
