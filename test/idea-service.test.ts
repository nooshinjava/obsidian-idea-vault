import { describe, expect, it } from "vitest";
import { MemoryNoteStore } from "@orbitkit/shared/testing";
import { migrateSettings, type IdeaVaultSettings } from "../src/domain/settings";
import { IdeaService } from "../src/services/idea-service";

function setup(files: Record<string, string> = {}, folder = "Idea Vault", data: Partial<IdeaVaultSettings> = {}) {
  const store = new MemoryNoteStore(files);
  const settings = migrateSettings({ ideasFolderPath: folder, ...data });
  let saves = 0;
  let changes = 0;
  const service = new IdeaService(settings, {
    store,
    save: () => {
      saves += 1;
      return Promise.resolve();
    },
    onChange: () => (changes += 1),
    now: () => new Date(2026, 10, 4, 9, 30),
  });
  return { store, settings, service, counts: () => ({ saves, changes }) };
}

describe("IdeaService.addIdea", () => {
  it("creates the note and records the idea", async () => {
    const { store, service, counts } = setup();
    const idea = await service.addIdea({ title: "Graph idea", content: "details", category: "research", tags: "ml, #graphs" });
    expect(idea.filePath).toBe("Idea Vault/2026-11-04-graph-idea.md");
    expect(store.frontmatterOf(idea.filePath ?? "")).toMatchObject({ title: "Graph idea", tags: ["ml", "graphs"], status: "new" });
    expect(service.ideas).toHaveLength(1);
    expect(counts()).toEqual({ saves: 1, changes: 1 });
  });

  it("never overwrites an existing note with the same name", async () => {
    const { store, service } = setup({ "Idea Vault/2026-11-04-same.md": "my precious note" });
    const first = await service.addIdea({ title: "Same" });
    const second = await service.addIdea({ title: "Same" });
    expect(store.files.get("Idea Vault/2026-11-04-same.md")).toBe("my precious note");
    expect(first.filePath).toBe("Idea Vault/2026-11-04-same 1.md");
    expect(second.filePath).toBe("Idea Vault/2026-11-04-same 2.md");
  });

  it("keeps notes inside the vault even with a hostile name or folder setting", async () => {
    const { service } = setup({}, "../../outside");
    const idea = await service.addIdea({ title: "x", fileName: "../../../etc/passwd" });
    expect(idea.filePath).toBe("Idea Vault/etc-passwd.md");
  });

  it("rejects empty titles", async () => {
    const { service } = setup();
    await expect(service.addIdea({ title: "   " })).rejects.toThrow();
    expect(service.ideas).toHaveLength(0);
  });
});

describe("IdeaService.updateIdea", () => {
  it("updates frontmatter and the idea section while keeping the user's notes", async () => {
    const { store, service } = setup();
    const idea = await service.addIdea({ title: "Draft" });
    const path = idea.filePath ?? "";
    await store.process(path, (content) => `${content}My notes — costs $& and $1\n`);
    await store.updateFrontmatter(path, (fm) => (fm.custom = "user value"));

    const result = await service.updateIdea(idea.id, { title: "Final", status: "developing", content: "Now with details", tags: "done" });
    expect(result.note).toEqual({ status: "updated" });

    const content = store.files.get(path) ?? "";
    expect(store.frontmatterOf(path)).toMatchObject({ title: "Final", status: "developing", tags: ["done"], custom: "user value" });
    expect(content).toContain("# 💭 Final");
    expect(content).toContain("Now with details");
    expect(content).toContain("My notes — costs $& and $1");
  });

  it("still updates the idea when its note was deleted", async () => {
    const { store, service } = setup();
    const idea = await service.addIdea({ title: "Gone" });
    await store.trash(idea.filePath ?? "");
    await expect(service.updateIdea(idea.id, { status: "hot" })).resolves.toMatchObject({
      idea: { status: "hot" },
      note: { status: "no-note" },
    });
  });

  it("throws for unknown ids and empty titles", async () => {
    const { service } = setup();
    await expect(service.updateIdea("missing", { status: "hot" })).rejects.toThrow();
    const idea = await service.addIdea({ title: "x" });
    await expect(service.updateIdea(idea.id, { title: " " })).rejects.toThrow();
  });
});

describe("IdeaService note lifecycle", () => {
  it("moves the note to the trash when deleting", async () => {
    const { store, service } = setup();
    const idea = await service.addIdea({ title: "Delete me" });
    await expect(service.deleteIdea(idea.id, { trashNote: true })).resolves.toEqual({ noteTrashed: true, noteKept: false });
    expect(service.ideas).toHaveLength(0);
    expect(store.trashed).toEqual([idea.filePath]);
  });

  it("follows renamed notes and folders", async () => {
    const { service } = setup();
    const idea = await service.addIdea({ title: "Move me" });
    await service.handleRename(idea.filePath ?? "", "Elsewhere/moved.md");
    expect(service.find(idea.id)?.filePath).toBe("Elsewhere/moved.md");
    await service.handleRename("Elsewhere", "Archive/Elsewhere");
    expect(service.find(idea.id)?.filePath).toBe("Archive/Elsewhere/moved.md");
  });

  it("forgets deleted notes and recreates them on demand", async () => {
    const { store, service } = setup();
    const idea = await service.addIdea({ title: "Phoenix" });
    const original = idea.filePath ?? "";
    await store.trash(original);
    await service.handleDelete(original);
    expect(service.find(idea.id)?.filePath).toBeNull();
    const recreated = await service.ensureIdeaNote(idea.id);
    expect(store.exists(recreated)).toBe(true);
  });

  it("exports to a monthly note and replaces it on re-export", async () => {
    const { store, service } = setup();
    await service.addIdea({ title: "One" });
    const path = await service.exportIdeas();
    expect(path).toBe("Idea Vault/Ideas-2026-11.md");
    await service.addIdea({ title: "Two" });
    await service.exportIdeas();
    expect(store.files.get(path)).toContain("Two");
  });
});

describe("review regressions", () => {
  it("never trashes a note that another idea links to (finding 2a)", async () => {
    const shared = "Idea Vault/shared.md";
    const { store, service } = setup({ [shared]: "# v1 note" }, "Idea Vault", {
      ideas: [
        { id: "1", title: "A", filePath: shared },
        { id: "2", title: "B", filePath: shared },
      ] as IdeaVaultSettings["ideas"],
    });
    const result = await service.deleteIdea("2", { trashNote: true });
    expect(result.noteTrashed).toBe(false);
    expect(store.exists(shared)).toBe(true);
  });

  it("doesn't touch a note that now belongs to another idea (finding 2b)", async () => {
    const { store, service } = setup();
    const a = await service.addIdea({ title: "Same" });
    const path = a.filePath ?? "";
    store.removeExternally(path); // deleted in Finder while Obsidian was closed: no event
    const b = await service.addIdea({ title: "Same" });
    expect(b.filePath).not.toBe(path); // the path is still reserved by A

    // Even if B's note does end up at A's old path, A can't rewrite or trash it.
    await store.create(path, store.files.get(b.filePath ?? "") ?? "");
    const update = await service.updateIdea(a.id, { title: "Changed" });
    expect(update.note).toEqual({ status: "unlinked" });
    expect(store.frontmatterOf(path)["idea-id"]).toBe(b.id);
    await expect(service.deleteIdea(a.id, { trashNote: true })).resolves.toMatchObject({ noteTrashed: false });
    expect(store.exists(path)).toBe(true);
  });

  it("a status change keeps tags and text the user edited in the note (finding 3)", async () => {
    const { store, service } = setup();
    const idea = await service.addIdea({ title: "Keep", content: "short", tags: "a" });
    const path = idea.filePath ?? "";
    await store.updateFrontmatter(path, (fm) => (fm.tags = ["a", "added-in-note"]));
    await store.process(path, (content) => content.replace("short", "short, expanded in the note"));

    const result = await service.updateIdea(idea.id, { status: "hot" });
    expect(result.note).toEqual({ status: "updated" });
    expect(store.frontmatterOf(path)).toMatchObject({ status: "hot", tags: ["a", "added-in-note"] });
    expect(store.files.get(path)).toContain("short, expanded in the note");

    const second = await service.updateIdea(idea.id, { content: "form change" });
    expect(second.note).toEqual({ status: "kept-edits" });
    expect(store.files.get(path)).toContain("short, expanded in the note");
  });

  it("keeps the saved change and reports when the note can't be updated (finding 10)", async () => {
    const { store, service } = setup();
    const idea = await service.addIdea({ title: "Broken YAML" });
    const path = idea.filePath ?? "";
    await store.process(path, (content) => content.replace("---\n", "---\n: : bad\n"));
    const result = await service.updateIdea(idea.id, { status: "developing" });
    expect(result.note.status).toBe("failed");
    expect(service.find(idea.id)?.status).toBe("developing");
  });

  it("relinks a note moved outside Obsidian by its id instead of duplicating it (finding 11)", async () => {
    const { store, service } = setup();
    const idea = await service.addIdea({ title: "Wanderer" });
    const original = idea.filePath ?? "";
    const content = store.files.get(original) ?? "";
    store.removeExternally(original);
    await service.handleDelete(original);
    await store.ensureFolder("Elsewhere");
    await store.create("Elsewhere/wanderer.md", content);

    await expect(service.ensureIdeaNote(idea.id)).resolves.toBe("Elsewhere/wanderer.md");
    expect([...store.files.keys()].filter((path) => path.startsWith("Idea Vault/"))).toEqual([]);
  });

  it("never replaces a user's note that has the export's name (finding 4)", async () => {
    const { store, service } = setup({ "Idea Vault/Ideas-2026-11.md": "my monthly plan" });
    await service.addIdea({ title: "One" });
    const path = await service.exportIdeas();
    expect(path).toBe("Idea Vault/Ideas-2026-11 1.md");
    expect(store.files.get("Idea Vault/Ideas-2026-11.md")).toBe("my monthly plan");
    await expect(service.exportIdeas()).resolves.toBe(path);
  });
});
