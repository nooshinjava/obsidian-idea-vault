import { setIcon } from "obsidian";
import { relativeDayLabel, truncate } from "@orbitkit/shared";
import { handleAsync } from "@orbitkit/shared/obsidian";
import type { Idea } from "../domain/settings";
import { categoryOf, statusOf } from "../domain/taxonomy";
import type { IdeaVaultController } from "./controller";

function addIconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
  const button = parent.createEl("button", { cls: "clickable-icon", attr: { type: "button", "aria-label": label } });
  setIcon(button, icon);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
}

/** Renders the pills (category + tags) shared by cards and the random-idea modal. */
export function renderIdeaPills(parent: HTMLElement, idea: Idea, maxTags = Infinity): void {
  const pills = parent.createDiv({ cls: "orbitkit-pills" });
  const category = categoryOf(idea.category);
  pills.createSpan({ cls: "orbitkit-pill", text: `${category.icon} ${category.name}` });
  for (const tag of idea.tags.slice(0, maxTags)) pills.createSpan({ cls: "orbitkit-pill", text: `#${tag}` });
}

export function renderIdeaCard(parent: HTMLElement, idea: Idea, controller: IdeaVaultController): void {
  const status = statusOf(idea.status);
  const card = parent.createDiv({
    cls: `orbitkit-card idea-vault-card is-${idea.status}`,
    attr: { tabindex: "0", role: "button", "aria-label": `Edit idea: ${idea.title}` },
  });

  const header = card.createDiv({ cls: "orbitkit-card-header" });
  header.createSpan({ cls: "orbitkit-card-title", text: `${status.icon} ${idea.title}` });
  header.createSpan({ cls: "orbitkit-card-meta", text: relativeDayLabel(idea.created) });

  if (idea.content) card.createDiv({ cls: "orbitkit-card-body", text: truncate(idea.content, 150) });

  const footer = card.createDiv({ cls: "orbitkit-card-footer" });
  renderIdeaPills(footer, idea, 3);
  const actions = footer.createDiv({ cls: "orbitkit-icon-buttons" });
  addIconButton(actions, "file-text", "Open note", handleAsync("Could not open the note", () => controller.openIdeaNote(idea)));
  addIconButton(actions, "pencil", "Edit idea", () => controller.openEdit(idea));
  addIconButton(
    actions,
    "trash-2",
    "Delete idea",
    handleAsync("Could not delete the idea", async () => {
      await controller.deleteIdea(idea);
    }),
  );

  card.addEventListener("click", () => controller.openEdit(idea));
  card.addEventListener("keydown", (event) => {
    if (event.target === card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      controller.openEdit(idea);
    }
  });
}
