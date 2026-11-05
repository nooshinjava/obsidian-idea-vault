import { Notice, Plugin, type TAbstractFile } from "obsidian";
import { noteSyncMessage, SaveQueue, VIEW_TYPES } from "@orbitkit/shared";
import {
  confirmAction,
  forEachView,
  handleAsync,
  ObsidianNoteStore,
  openNote,
  PluginDataStore,
  revealSiblingView,
  revealView,
} from "@orbitkit/shared/obsidian";
import { migrateSettings, SCHEMA_VERSION, type Idea } from "./domain/settings";
import { IdeaService, type IdeaChanges } from "./services/idea-service";
import type { IdeaVaultController } from "./ui/controller";
import { IdeaVaultView } from "./ui/idea-vault-view";
import { CaptureModal, EditIdeaModal, RandomIdeaModal } from "./ui/modals";
import { IdeaVaultSettingTab } from "./ui/settings-tab";

export default class IdeaVaultPlugin extends Plugin implements IdeaVaultController {
  service!: IdeaService;

  override async onload(): Promise<void> {
    const data = new PluginDataStore(this, SCHEMA_VERSION, "Idea Vault");
    const settings = migrateSettings(await data.load());
    const queue = new SaveQueue(data);
    const save = () => queue.save(settings);
    this.service = new IdeaService(settings, {
      store: new ObsidianNoteStore(this.app),
      save,
      onChange: () => this.refreshViews(),
    });
    if (data.loadedStatus === "outdated") await save();

    this.registerView(VIEW_TYPES.ideaVault, (leaf) => new IdeaVaultView(leaf, this));
    this.addRibbonIcon("lightbulb", "Open Idea Vault", handleAsync("Could not open Idea Vault", () => this.openPanel()));

    this.addCommand({ id: "quick-capture", name: "Quick capture idea", callback: () => this.openCapture() });
    this.addCommand({
      id: "open-idea-vault",
      name: "Open panel",
      callback: handleAsync("Could not open Idea Vault", () => this.openPanel()),
    });
    this.addCommand({ id: "random-idea", name: "Show a random idea", callback: () => this.showRandomIdea() });
    this.addCommand({
      id: "export-ideas",
      name: "Export ideas to Markdown",
      callback: handleAsync("Export failed", () => this.exportIdeas()),
    });

    this.addSettingTab(new IdeaVaultSettingTab(this.app, this, this.service, save));

    // Data from a newer plugin version is read-only, so background link updates are skipped.
    if (data.readOnly) return;
    this.registerEvent(
      this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) =>
        handleAsync("Could not update a moved idea note", () => this.service.handleRename(oldPath, file.path))(),
      ),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file: TAbstractFile) =>
        handleAsync("Could not update a deleted idea note", () => this.service.handleDelete(file.path))(),
      ),
    );
  }

  async openPanel(): Promise<void> {
    await revealView(this.app, VIEW_TYPES.ideaVault);
  }

  openCapture(): void {
    new CaptureModal(this.app, this).open();
  }

  openEdit(idea: Idea): void {
    new EditIdeaModal(this.app, this, idea).open();
  }

  showRandomIdea(excludeId?: string): void {
    const idea = this.service.randomIdea(excludeId);
    if (!idea) {
      new Notice(excludeId ? "No other ideas to show." : "No ideas to show yet. Capture one first!");
      return;
    }
    new RandomIdeaModal(this.app, this, idea).open();
  }

  async openIdeaNote(idea: Idea): Promise<void> {
    await openNote(this.app, await this.service.ensureIdeaNote(idea.id));
  }

  async updateIdea(id: string, changes: IdeaChanges, successMessage = "Idea updated"): Promise<void> {
    const { note } = await this.service.updateIdea(id, changes);
    new Notice(noteSyncMessage("Idea", note) ?? successMessage);
  }

  async deleteIdea(idea: Idea): Promise<boolean> {
    const confirmed = await confirmAction(this.app, {
      title: "Delete idea?",
      message: `"${idea.title}" will be removed from Idea Vault and its note moved to the trash.`,
    });
    if (!confirmed) return false;
    const { noteKept } = await this.service.deleteIdea(idea.id, { trashNote: true });
    new Notice(noteKept ? "Idea deleted. Its note was kept because it couldn't be confirmed as this idea's note." : "Idea deleted");
    return true;
  }

  async exportIdeas(): Promise<void> {
    const path = await this.service.exportIdeas();
    new Notice(`📄 Ideas exported to ${path}`);
    await openNote(this.app, path);
  }

  async openMindfulFocus(): Promise<void> {
    await revealSiblingView(this.app, VIEW_TYPES.mindfulFocus, "Mindful Focus");
  }

  private refreshViews(): void {
    forEachView(this.app, VIEW_TYPES.ideaVault, (view): view is IdeaVaultView => view instanceof IdeaVaultView, (view) =>
      view.render(),
    );
  }
}
