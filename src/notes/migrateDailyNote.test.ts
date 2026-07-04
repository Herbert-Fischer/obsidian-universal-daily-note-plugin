import { describe, expect, it } from "vitest";
import { migrateDailyNoteContent } from "./migrateDailyNote";

describe("migrateDailyNoteContent", () => {
  it("converts legacy bullets and keeps mfh nav callout", () => {
    const input = `---
fileClass: Daily Notes
Erstellt: 2026-04-25
Up: "[[Home]]"
Zusammenfassung: Test
---
>[!mfh]+ nav

## Tagebuch
- 08:10 Aufstehen

## Aufgaben
- [ ] Task
`;
    const out = migrateDailyNoteContent(input, "2026-04-25")!;
    expect(out).toContain("Erstellt:\n  2026-04-25");
    expect(out).toContain('Up: "[[Tagebuch]]"');
    expect(out).toContain("[!mfh]+");
    expect(out).toContain("dv.current().up");
    expect(out).toContain("> [!tagebuch-ref] 25.04.2026");
    expect(out).toContain("> - 08:10 Aufstehen");
    expect(out).toContain("- [ ] Task");
  });

  it("migrates standalone tagebuch callout under heading", () => {
    const input = `---
fileClass: Daily Notes
Zusammenfassung:
---
>[!mfh]+ nav

> [!tagebuch-ref] Tagebuch
> - 07:10 Aufstehen
`;
    const out = migrateDailyNoteContent(input, "2026-06-23")!;
    expect(out).toContain("[!mfh]+");
    expect(out).toContain("## Tagebuch");
    expect(out).toContain("> [!tagebuch-ref] 23.06.2026");
    expect(out).toContain("> - 07:10 Aufstehen");
  });

  it("wraps Sonstiges bullets in notes callout", () => {
    const input = `---
fileClass: Daily Notes
Zusammenfassung:
---
## Tagebuch
> [!tagebuch-ref] 25.04.2026
>

## Sonstiges
- Freitext
`;
    const out = migrateDailyNoteContent(input, "2026-04-25")!;
    expect(out).toContain("[!mfh]+");
    expect(out).toContain("> [!notes] Sonstiges");
    expect(out).toContain("> - Freitext");
  });

  it("moves Reisen trip callouts from Sonstiges to Reisen", () => {
    const input = `---
fileClass: Daily Notes
Zusammenfassung:
---
## Tagebuch
> [!tagebuch-ref] 15.06.2026
> - 07:45 Aufstehen

## Sonstiges
> [!notes] Mamas 90ter Geburtstag
> - [[Boxi]]tour Tag 6.3: **Gersfeld**
> - [[Boxi]]tour Tag 6.2: **Oberrieden**
`;
    const out = migrateDailyNoteContent(input, "2026-06-15")!;
    expect(out).toContain("## Reisen");
    expect(out).toContain("[!compass]+ Reisen [Mamas 90ter Geburtstag]");
    expect(out).toContain("> - [[Boxi]]tour Tag 6.3: **Gersfeld**");
    expect(out).not.toContain("## Sonstiges");
  });
});
