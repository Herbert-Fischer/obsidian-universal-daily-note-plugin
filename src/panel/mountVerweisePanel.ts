import type UniversalDailyNotePlugin from "../main";
import VerweisePanel from "./VerweisePanel.svelte";

export type VerweisePanelMount = {
  destroy: () => void;
};

export function mountVerweisePanel(
  target: HTMLElement,
  plugin: UniversalDailyNotePlugin,
): VerweisePanelMount {
  const component = new VerweisePanel({
    target,
    props: {
      app: plugin.app,
      plugin,
    },
  });

  return {
    destroy: () => component.$destroy(),
  };
}
