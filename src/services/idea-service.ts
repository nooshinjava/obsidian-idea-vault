import {
  createId,
  createUniqueNote,
  errorMessage,
  mergeFrontmatter,
  noteOwnership,
  parseTags,
  resolveFolderSetting,
  writeGeneratedNote,
  type NoteStore,
  type NoteSync,
  type Ownership,
} from "@orbitkit/shared";
import { pickRandomIdea, suggestFileName } from "../domain/ideas";
import { buildExport, buildIdeaNote, changedFrontmatter, EXPORT_MARKER, ID_KEY, syncIdeaNote } from "../domain/markdown";
import { DEFAULT_IDEAS_FOLDER, type Idea, type IdeaVaultSettings } from "../domain/settings";
import { DEFAULT_CATEGORY, type IdeaCategoryId, type IdeaStatusId } from "../domain/taxonomy";

export interface NewIdeaInput {
  title: string;
  content?: string;
  category?: IdeaCategoryId;
  /** Comma-separated tags or a list. */
  tags?: string | readonly string[];
  /** Note name without extension; defaults to "YYYY-MM-DD-slug". */
  fileName?: string;
}

export interface IdeaChanges {
  title?: string;
  content?: string;
  category?: IdeaCategoryId;
  status?: IdeaStatusId;
  tags?: string | readonly string[];
}

export interface UpdateResult {
  idea: Idea;
  note: NoteSync;
}

export interface DeleteResult {
  /** The note was moved to the trash. */
  noteTrashed: boolean;
  /** The note was left in place because it couldn't be confirmed as this idea's note. */
  noteKept: boolean;
}

export interface IdeaServiceDeps {
  store: NoteStore;
  /** Persists the settings object (data.json). */
  save: () => Promise<void>;
  /** Called after every change so open views can re-render. */
  onChange?: () => void;
  now?: () => Date;
}

function copyIdea(idea: Idea): Idea {
  return { ...idea, tags: [...idea.tags] };
}

function sameContent(a: Idea, b: Idea): boolean {
  return (
    a.title === b.title &&
    a.content === b.content &&
    a.category === b.category &&
    a.status === b.status &&
    a.tags.join("\n") === b.tags.join("\n")
  );
}

export class IdeaService {
  private readonly now: () => Date;

  constructor(
    readonly settings: IdeaVaultSettings,
    private readonly deps: IdeaServiceDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  get ideas(): readonly Idea[] {
    return this.settings.ideas;
  }

  get folder(): string {
    return resolveFolderSetting(this.settings.ideasFolderPath, DEFAULT_IDEAS_FOLDER);
  }

  find(id: string): Idea | undefined {
    return this.settings.ideas.find((idea) => idea.id === id);
  }

  suggestFileName(title: string): string {
    return suggestFileName(title, this.now());
  }

  /** Creates the idea and its note. The note never overwrites an existing file. */
  async addIdea(input: NewIdeaInput): Promise<Idea> {
    const title = input.title.trim();
    if (!title) throw new Error("An idea needs a title.");
    const now = this.now();
    const timestamp = now.toISOString();
    const idea: Idea = {
      id: createId(now.getTime()),
      title,
      content: (input.content ?? "").trim(),
      category: input.category ?? DEFAULT_CATEGORY,
      status: "new",
      tags: parseTags(input.tags ?? []),
      created: timestamp,
      updated: timestamp,
      filePath: null,
    };
    const fileName = input.fileName?.trim() || suggestFileName(title, now);
    idea.filePath = await createUniqueNote(this.deps.store, this.folder, fileName, buildIdeaNote(idea), (path) =>
      this.isClaimed(path, idea.id),
    );
    this.settings.ideas.push(idea);
    await this.commit();
    return idea;
  }

  /**
   * Saves the changes, then brings the note in line: only changed frontmatter
   * fields are written, and the title/Idea section only if the user hasn't
   * edited them in the note. A note problem never loses the saved changes.
   */
  async updateIdea(id: string, changes: IdeaChanges): Promise<UpdateResult> {
    const idea = this.require(id);
    const before = copyIdea(idea);
    const after = copyIdea(idea);
    if (changes.title !== undefined) {
      after.title = changes.title.trim();
      if (!after.title) throw new Error("An idea needs a title.");
    }
    if (changes.content !== undefined) after.content = changes.content.trim();
    if (changes.category !== undefined) after.category = changes.category;
    if (changes.status !== undefined) after.status = changes.status;
    if (changes.tags !== undefined) after.tags = parseTags(changes.tags);
    if (sameContent(before, after)) return { idea, note: { status: "unchanged" } };

    after.updated = this.now().toISOString();
    Object.assign(idea, after);
    await this.commit();
    return { idea, note: await this.syncNote(idea, before) };
  }

  /** Removes the idea. Its note is trashed only when it is verifiably this idea's note. */
  async deleteIdea(id: string, { trashNote }: { trashNote: boolean }): Promise<DeleteResult> {
    const idea = this.require(id);
    const result: DeleteResult = { noteTrashed: false, noteKept: false };
    const path = idea.filePath;
    if (trashNote && path && this.deps.store.exists(path)) {
      if ((await this.ownership(idea, path)) === "owned") {
        await this.deps.store.trash(path);
        result.noteTrashed = true;
      } else {
        result.noteKept = true;
      }
    }
    this.settings.ideas = this.settings.ideas.filter((candidate) => candidate.id !== id);
    await this.commit();
    return result;
  }

  /**
   * Returns the idea's note path: the linked note if it is still this idea's,
   * else a note carrying this idea's id (e.g. moved outside Obsidian), else a
   * newly created note.
   */
  async ensureIdeaNote(id: string): Promise<string> {
    const idea = this.require(id);
    const { store } = this.deps;
    if (idea.filePath && store.exists(idea.filePath)) {
      if ((await this.ownership(idea, idea.filePath)) !== "not-owned") return idea.filePath;
      idea.filePath = null;
    }
    const found = await store.findNoteByFrontmatter(ID_KEY, idea.id);
    if (found && !this.isClaimed(found, idea.id)) {
      idea.filePath = found;
    } else {
      idea.filePath = await createUniqueNote(
        store,
        this.folder,
        suggestFileName(idea.title, new Date(idea.created)),
        buildIdeaNote(idea),
        (path) => this.isClaimed(path, idea.id),
      );
    }
    await this.commit();
    return idea.filePath;
  }

  randomIdea(excludeId?: string, random?: () => number): Idea | undefined {
    return pickRandomIdea(this.settings.ideas, excludeId, random);
  }

  /** Writes this month's export note (replacing only a previous export) and returns its path. */
  async exportIdeas(): Promise<string> {
    const now = this.now();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return writeGeneratedNote(
      this.deps.store,
      this.folder,
      `Ideas-${month}`,
      buildExport(this.settings.ideas, now),
      EXPORT_MARKER,
    );
  }

  /** Keeps note links valid when notes or folders are renamed inside Obsidian. */
  async handleRename(oldPath: string, newPath: string): Promise<void> {
    let changed = false;
    for (const idea of this.settings.ideas) {
      if (!idea.filePath) continue;
      if (idea.filePath === oldPath) {
        idea.filePath = newPath;
        changed = true;
      } else if (idea.filePath.startsWith(`${oldPath}/`)) {
        idea.filePath = newPath + idea.filePath.slice(oldPath.length);
        changed = true;
      }
    }
    if (changed) await this.commit();
  }

  /** Forgets the note link when a note is deleted outside the plugin (the idea itself stays). */
  async handleDelete(path: string): Promise<void> {
    let changed = false;
    for (const idea of this.settings.ideas) {
      if (idea.filePath === path) {
        idea.filePath = null;
        changed = true;
      }
    }
    if (changed) await this.commit();
  }

  private async syncNote(idea: Idea, before: Idea): Promise<NoteSync> {
    const { store } = this.deps;
    const path = idea.filePath;
    if (!path || !store.exists(path)) return { status: "no-note" };
    try {
      if ((await this.ownership(idea, path)) === "not-owned") {
        idea.filePath = null;
        await this.commit();
        return { status: "unlinked" };
      }
      const fields = changedFrontmatter(before, idea);
      await store.updateFrontmatter(path, (frontmatter) => mergeFrontmatter(frontmatter, fields));
      let keptEdits = false;
      await store.process(path, (content) => {
        const update = syncIdeaNote(content, before, idea);
        keptEdits = update.keptEdits;
        return update.content;
      });
      return { status: keptEdits ? "kept-edits" : "updated" };
    } catch (error) {
      return { status: "failed", error: errorMessage(error) };
    }
  }

  private ownership(idea: Idea, path: string): Promise<Ownership> {
    return noteOwnership(this.deps.store, path, ID_KEY, idea.id, this.isClaimed(path, idea.id));
  }

  /** True when another idea links to `path` (compared case-insensitively). */
  private isClaimed(path: string, exceptId: string): boolean {
    const key = path.toLowerCase();
    return this.settings.ideas.some((other) => other.id !== exceptId && other.filePath?.toLowerCase() === key);
  }

  private require(id: string): Idea {
    const idea = this.find(id);
    if (!idea) throw new Error("That idea no longer exists.");
    return idea;
  }

  private async commit(): Promise<void> {
    await this.deps.save();
    this.deps.onChange?.();
  }
}
