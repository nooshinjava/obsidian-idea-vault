import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { countByStatus, FILTER_OPTIONS, pickRandomIdea, suggestFileName, visibleIdeas } from "../src/domain/ideas";
import { buildExport, buildIdeaNote, changedFrontmatter, IDEA_HEADING, NOTES_HEADING, syncIdeaNote } from "../src/domain/markdown";
import { migrateSettings, type Idea } from "../src/domain/settings";

function idea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: "id-1",
    title: "Test idea",
    content: "",
    category: "thought",
    status: "new",
    tags: [],
    created: "2026-11-01T10:00:00.000Z",
    updated: "2026-11-01T10:00:00.000Z",
    filePath: "Idea Vault/test.md",
    ...overrides,
  };
}

describe("migrateSettings", () => {
  it("upgrades v1 data and drops the stored taxonomy copies", () => {
    const v1 = {
      ideasFolderPath: "Research/Ideas",
      categories: [{ id: "research" }],
      statuses: [{ id: "new" }],
      ideas: [
        {
          id: "1700000000000",
          title: "  Use transformers  ",
          content: "details",
          category: "research",
          status: "hot",
          tags: ["ml", " #nlp ", 42],
          created: "2026-01-01T00:00:00.000Z",
          updated: "2026-01-02T00:00:00.000Z",
          filename: "2026-01-01-use-transformers",
          filePath: "Research/Ideas/2026-01-01-use-transformers.md",
        },
      ],
    };
    const settings = migrateSettings(v1);
    expect(settings).toEqual({
      schemaVersion: 2,
      ideasFolderPath: "Research/Ideas",
      openAfterCapture: true,
      ideas: [
        {
          id: "1700000000000",
          title: "Use transformers",
          content: "details",
          category: "research",
          status: "hot",
          tags: ["ml", "nlp"],
          created: "2026-01-01T00:00:00.000Z",
          updated: "2026-01-02T00:00:00.000Z",
          filePath: "Research/Ideas/2026-01-01-use-transformers.md",
        },
      ],
    });
  });

  it("repairs corrupt data instead of throwing", () => {
    const now = new Date("2026-11-04T12:00:00.000Z");
    const settings = migrateSettings(
      {
        ideas: [
          null,
          "text",
          { title: "" },
          { id: "dup", title: "A", category: "nope", status: "weird", created: "not a date", filePath: "../../x.md" },
          { id: "dup", title: "B", filePath: "notes/b.txt" },
        ],
      },
      now,
    );
    expect(settings.ideas).toHaveLength(2);
    const [a, b] = settings.ideas;
    expect(a).toMatchObject({ category: "thought", status: "new", created: now.toISOString(), filePath: null });
    expect(b?.filePath).toBeNull();
    expect(a?.id).not.toBe(b?.id);
  });

  it("returns defaults for missing data", () => {
    expect(migrateSettings(null)).toEqual({ schemaVersion: 2, ideasFolderPath: "Idea Vault", openAfterCapture: true, ideas: [] });
  });

  it("unlinks duplicate note paths from version 1 (review finding 2)", () => {
    const settings = migrateSettings({
      ideas: [
        { id: "1", title: "A", filePath: "Idea Vault/same.md" },
        { id: "2", title: "B", filePath: "idea vault/SAME.md" },
      ],
    });
    expect(settings.ideas.map((i) => i.filePath)).toEqual(["Idea Vault/same.md", null]);
  });

  it("never shares default arrays between loads", () => {
    const first = migrateSettings(null);
    first.ideas.push(idea());
    expect(migrateSettings(null).ideas).toEqual([]);
  });
});

describe("filtering and sorting", () => {
  const ideas = [
    idea({ id: "a", title: "Alpha", status: "hot", category: "research", created: "2026-11-01T00:00:00Z" }),
    idea({ id: "b", title: "Beta", content: "about graphs", created: "2026-11-03T00:00:00Z", tags: ["Graphs"] }),
    idea({ id: "c", title: "Gamma", status: "archived", category: "connection", created: "2026-11-02T00:00:00Z" }),
  ];

  it("filters by status or category and sorts newest first", () => {
    expect(visibleIdeas(ideas, "all", "").map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(visibleIdeas(ideas, "hot", "").map((i) => i.id)).toEqual(["a"]);
    expect(visibleIdeas(ideas, "connection", "").map((i) => i.id)).toEqual(["c"]);
  });

  it("searches title, content and tags case-insensitively", () => {
    expect(visibleIdeas(ideas, "all", "GRAPH").map((i) => i.id)).toEqual(["b"]);
    expect(visibleIdeas(ideas, "all", "alp").map((i) => i.id)).toEqual(["a"]);
  });

  it("offers a filter for every category", () => {
    expect(FILTER_OPTIONS.map((option) => option.id)).toContain("connection");
  });

  it("counts statuses", () => {
    expect(countByStatus(ideas)).toMatchObject({ hot: 1, new: 1, archived: 1, developing: 0 });
  });

  it("picks random ideas that are still in play", () => {
    expect(pickRandomIdea(ideas, undefined, () => 0)?.id).toBe("a");
    expect(pickRandomIdea(ideas, "a", () => 0)?.id).toBe("b");
    expect(pickRandomIdea([idea({ status: "implemented" })])).toBeUndefined();
  });

  it("suggests file names, including for non-Latin titles", () => {
    const date = new Date(2026, 10, 4);
    expect(suggestFileName("My new idea!", date)).toBe("2026-11-04-my-new-idea");
    expect(suggestFileName("新しいアイデア", date)).toBe("2026-11-04-新しいアイデア");
    expect(suggestFileName("!!!", date)).toBe("2026-11-04-idea");
  });
});

describe("notes", () => {
  it("writes valid frontmatter even for hostile titles", () => {
    const note = buildIdeaNote(idea({ title: 'Quote " colon: and\nnewline', tags: ["a", "b"] }));
    const yaml = /^---\n([\s\S]*?)\n---/.exec(note)?.[1] ?? "";
    expect(parse(yaml)).toMatchObject({ title: 'Quote " colon: and\nnewline', tags: ["a", "b"], "idea-id": "id-1" });
    expect(note).toContain("# 💭 Quote \" colon: and newline");
  });

  it("updates the title and details but keeps the user's notes", () => {
    const before = idea({ content: "first draft" });
    const original = buildIdeaNote(before) + "My own thoughts\n- keep me\n";
    const { content, keptEdits } = syncIdeaNote(original, before, idea({ title: "Renamed", category: "research", content: "second draft" }));
    expect(keptEdits).toBe(false);
    expect(content).toContain("# 🔬 Renamed");
    expect(content).toContain(`${IDEA_HEADING}\n\nsecond draft\n\n${NOTES_HEADING}`);
    expect(content).toContain("My own thoughts\n- keep me");
    expect(content).not.toContain("first draft");
  });

  it("keeps sections the user edited in the note (review finding 3)", () => {
    const before = idea({ content: "short" });
    const edited = buildIdeaNote(before).replace("short", "short, expanded in the note");
    const result = syncIdeaNote(edited, before, idea({ content: "changed in the form" }));
    expect(result.keptEdits).toBe(true);
    expect(result.content).toContain("short, expanded in the note");
  });

  it("leaves the note body alone for a status-only change", () => {
    const before = idea({ content: "details" });
    const note = buildIdeaNote(before);
    expect(syncIdeaNote(note, before, idea({ content: "details", status: "hot" }))).toEqual({ content: note, keptEdits: false });
  });

  it("only renames the plugin's own title line (review finding 8)", () => {
    const before = idea({ title: "Old" });
    const note = buildIdeaNote(before).replace("# 💭 Old", "") + "# Meeting 2026-11-03\n**Status:** waiting on reviewer 2\n";
    const { content, keptEdits } = syncIdeaNote(note, before, idea({ title: "New", status: "hot" }));
    expect(keptEdits).toBe(true);
    expect(content).toContain("# Meeting 2026-11-03");
    expect(content).toContain("**Status:** waiting on reviewer 2");
  });

  it("writes only changed frontmatter fields", () => {
    const before = idea({ tags: ["a"] });
    const after = idea({ tags: ["a"], status: "hot", updated: "2026-11-05T00:00:00.000Z" });
    expect(changedFrontmatter(before, after)).toEqual({ status: "hot", updated: after.updated, "idea-id": "id-1" });
  });

  it("keeps the metadata lines of version 1 notes in sync", () => {
    const v1Note = [
      "---",
      'title: "Old"',
      "---",
      "",
      "# 💭 Old",
      "",
      "**Category:** 💭 Thought",
      "**Status:** 💫 New",
      "**Tags:** #a",
      "",
      "---",
      "",
      "## 💭 Idea",
      "",
      "old content",
      "",
      "---",
      "",
      "## 📝 Notes",
      "",
      "**Status:** my own line",
    ].join("\n");
    const before = idea({ title: "Old", tags: ["a"], content: "old content" });
    const { content } = syncIdeaNote(v1Note, before, idea({ title: "Old", status: "hot", tags: [], content: "new content" }));
    expect(content).toContain("**Status:** 🔥 Hot");
    expect(content).toContain("**Tags:** —");
    expect(content).toContain("## 💭 Idea\n\nnew content\n\n---");
    expect(content).toContain("**Status:** my own line");
  });

  it("exports ideas grouped by status", () => {
    const text = buildExport(
      [idea({ id: "1", title: "Hot one", status: "hot", tags: ["x"] }), idea({ id: "2", title: "New one", filePath: null })],
      new Date(2026, 10, 4),
    );
    expect(text.indexOf("## 🔥 Hot (1)")).toBeLessThan(text.indexOf("## 💫 New (1)"));
    expect(text).toContain("[[Idea Vault/test|Open note]]");
    expect(text).toContain("#x");
    expect(text.startsWith("---\nidea-vault-export: true\n---")).toBe(true);
  });
});
