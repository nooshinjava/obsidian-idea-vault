import { ItemView, type WorkspaceLeaf } from "obsidian";
import { VIEW_TYPES } from "@orbitkit/shared";
import { createChipGroup, handleAsync } from "@orbitkit/shared/obsidian";
import { countByStatus, FILTER_OPTIONS, visibleIdeas, type IdeaFilter } from "../domain/ideas";
import type { IdeaVaultController } from "./controller";
import { renderIdeaCard } from "./idea-card";

export class IdeaVaultView extends ItemView {
  private filter: IdeaFilter = "all";
  private query = "";
  private listEl: HTMLElement | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly controller: IdeaVaultController,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return VIEW_TYPES.ideaVault;
  }

  override getDisplayText(): string {
    return "Idea Vault";
  }

  override getIcon(): string {
    return "lightbulb";
  }

  override onOpen(): Promise<void> {
    this.render();
    return Promise.resolve();
  }

  override onClose(): Promise<void> {
    this.contentEl.empty();
    return Promise.resolve();
  }

  render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("orbitkit-view", "idea-vault-view");

    const actions = root.createDiv({ cls: "orbitkit-actions" });
    this.addActionButton(actions, "⚡ Capture idea", () => this.controller.openCapture(), true);
    this.addActionButton(actions, "🎲 Random idea", () => this.controller.showRandomIdea());
    this.addActionButton(actions, "📄 Export", handleAsync("Export failed", () => this.controller.exportIdeas()));
    this.addActionButton(actions, "🎯 Focus", handleAsync("Could not open Mindful Focus", () => this.controller.openMindfulFocus()));

    const ideas = this.controller.service.ideas;
    const counts = countByStatus(ideas);
    const stats = root.createDiv({ cls: "orbitkit-stats" });
    for (const [value, label] of [
      [ideas.length, "Total"],
      [counts.new, "💫 New"],
      [counts.hot, "🔥 Hot"],
      [counts.developing, "🌱 Developing"],
    ] as const) {
      const stat = stats.createDiv({ cls: "orbitkit-stat" });
      stat.createDiv({ cls: "orbitkit-stat-value", text: String(value) });
      stat.createDiv({ cls: "orbitkit-stat-label", text: label });
    }

    const search = root.createEl("input", {
      type: "search",
      attr: { placeholder: "Search ideas…", "aria-label": "Search ideas" },
    });
    search.value = this.query;
    search.addEventListener("input", () => {
      this.query = search.value;
      this.renderList();
    });

    createChipGroup(root, FILTER_OPTIONS, this.filter, (id) => {
      this.filter = id;
      this.renderList();
    }, "Filter ideas");

    const section = root.createDiv({ cls: "orbitkit-section" });
    section.createEl("h3", { cls: "orbitkit-section-title", text: "💡 Ideas" });
    this.listEl = section.createDiv();
    this.renderList();
  }

  private renderList(): void {
    const list = this.listEl;
    if (!list) return;
    list.empty();
    const ideas = visibleIdeas(this.controller.service.ideas, this.filter, this.query);
    if (ideas.length === 0) {
      const empty = list.createDiv({ cls: "orbitkit-empty-state" });
      empty.createDiv({ cls: "orbitkit-empty-state-icon", text: "💡" });
      const filtered = this.query.trim() !== "" || this.filter !== "all";
      empty.createEl("p", { text: filtered ? "No ideas match." : "No ideas yet. Capture your first one!" });
      return;
    }
    for (const idea of ideas) renderIdeaCard(list, idea, this.controller);
  }

  private addActionButton(parent: HTMLElement, text: string, onClick: () => void, primary = false): void {
    const button = parent.createEl("button", { text, attr: { type: "button" } });
    if (primary) button.addClass("mod-cta");
    button.addEventListener("click", onClick);
  }
}
