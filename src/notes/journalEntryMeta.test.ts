import { describe, expect, it } from "vitest";
import {
  appendEntryMeta,
  formatEntryMetaComment,
  parseEntryMetaComment,
  profileIconName,
  stripEntryMeta,
} from "./journalEntryMeta";

describe("journalEntryMeta", () => {
  it("roundtrips inline metadata", () => {
    const line = '12:00 Abfahrt Hamburg <!-- udn-entry:{"id":"a1b2","profile":"reisen","context":"Mamas 90ter"} -->';
    const { body, meta } = stripEntryMeta(line);
    expect(body).toBe("12:00 Abfahrt Hamburg");
    expect(meta).toEqual({ id: "a1b2", profile: "reisen", context: "Mamas 90ter" });
    expect(appendEntryMeta(body, meta!)).toBe(line);
  });

  it("resolves profile icon names", () => {
    expect(profileIconName("reisen")).toBe("compass");
    expect(profileIconName("wandern")).toBe("mountain");
    expect(profileIconName("spaziergang")).toBe("person-walking");
    expect(profileIconName("heizung")).toBe("flame");
    expect(profileIconName("tagebuch")).toBe("");
  });

  it("formats minimal meta", () => {
    expect(formatEntryMetaComment({ id: "x1" })).toBe('<!-- udn-entry:{"id":"x1"} -->');
  });

  it("roundtrips wandern entry with optional reise assignment", () => {
    const line =
      '09:45 Wandern: Test <!-- udn-entry:{"id":"knvh","profile":"wandern","context":"Wandern: Test","reise":"Sommer 2026"} -->';
    const { body, meta } = stripEntryMeta(line);
    expect(body).toBe("09:45 Wandern: Test");
    expect(meta).toEqual({
      id: "knvh",
      profile: "wandern",
      context: "Wandern: Test",
      reise: "Sommer 2026",
    });
    expect(appendEntryMeta(body, meta!)).toBe(line);
  });

  it("returns null for invalid comment", () => {
    expect(parseEntryMetaComment("no meta here")).toBeNull();
  });
});
