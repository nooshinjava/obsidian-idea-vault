import { Modal, Notice, type App } from "obsidian";
import {
  addButtonRow,
  addTextArea,
  addTextInput,
  createChipGroup,
  createField,
  handleAsync,
  onModEnter,
} from "@orbitkit/shared/obsidian";
import type { Idea } from "../domain/settings";
import {
  DEFAULT_CATEGORY,
  IDEA_CATEGORIES,
  IDEA_STATUSES,
  statusOf,
  type IdeaCategoryId,
  type IdeaStatusId,
} from "../domain/taxonomy";
import type { IdeaVaultController } from "./controller";
import { renderIdeaPills } from "./idea-card";

const CATEGORY_OPTIONS = IDEA_CATEGORIES.map((category) => ({ id: category.id, label: `${category.icon} ${category.name}` }));
const STATUS_OPTIONS = IDEA_STATUSES.map((status) => ({ id: status.id, label: `${status.icon} ${status.name}` }));

/** Prevents double submission while an async save is running. */
function guarded(task: () => Promise<void>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      await task();
    } finally {
      running = false;
    }
  };
}

export class CaptureModal extends Modal {
  private category: IdeaCategoryId = DEFAULT_CATEGORY;

  constructor(
    app: App,
    private readonly controller: IdeaVaultController,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { service } = this.controller;
    this.setTitle("⚡ Quick capture");
    this.contentEl.addClass("idea-vault-modal");
    const form = this.contentEl.createDiv({ cls: "orbitkit-form" });

    const titleInput = addTextInput(form, { label: "Idea", placeholder: "What's your idea?" });
    const fileNameInput = addTextInput(form, {
      label: "Note name",
      value: service.suggestFileName(""),
      hint: "Saved as a note in your ideas folder. Existing notes are never overwritten.",
    });
    let fileNameEdited = false;
    fileNameInput.addEventListener("input", () => (fileNameEdited = true));
    titleInput.addEventListener("input", () => {
      if (!fileNameEdited) fileNameInput.value = service.suggestFileName(titleInput.value);
    });

    const details = addTextArea(form, { label: "Details (optional)", placeholder: "Add more context…" });
    const { field } = createField(form, "Category");
    createChipGroup(field, CATEGORY_OPTIONS, this.category, (id) => (this.category = id), "Category");
    const tags = addTextInput(form, {
      label: "Tags (optional)",
      placeholder: "hypothesis, methods, follow-up",
      hint: "Separate tags with commas.",
    });

    const submit = handleAsync(
      "Could not save the idea",
      guarded(async () => {
        if (!titleInput.value.trim()) {
          new Notice("Enter an idea first.");
          titleInput.focus();
          return;
        }
        const idea = await service.addIdea({
          title: titleInput.value,
          content: details.value,
          category: this.category,
          tags: tags.value,
          fileName: fileNameInput.value,
        });
        this.close();
        new Notice(`💡 Idea saved to ${idea.filePath ?? "your vault"}`);
        if (service.settings.openAfterCapture) await this.controller.openIdeaNote(idea);
      }),
    );

    addButtonRow(this.contentEl, [
      { text: "Save idea", variant: "cta", onClick: submit },
      { text: "Cancel", onClick: () => this.close() },
    ]);
    onModEnter(this.contentEl, submit);
    titleInput.focus();
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}

export class EditIdeaModal extends Modal {
  constructor(
    app: App,
    private readonly controller: IdeaVaultController,
    private readonly idea: Idea,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { idea, controller } = this;
    let status: IdeaStatusId = idea.status;
    let category: IdeaCategoryId = idea.category;

    this.setTitle("✏️ Edit idea");
    this.contentEl.addClass("idea-vault-modal");
    const form = this.contentEl.createDiv({ cls: "orbitkit-form" });
    const titleInput = addTextInput(form, { label: "Idea", value: idea.title });
    const details = addTextArea(form, { label: "Details", value: idea.content, rows: 4 });
    createChipGroup(createField(form, "Status").field, STATUS_OPTIONS, status, (id) => (status = id), "Status");
    createChipGroup(createField(form, "Category").field, CATEGORY_OPTIONS, category, (id) => (category = id), "Category");
    const tags = addTextInput(form, { label: "Tags", value: idea.tags.join(", "), hint: "Separate tags with commas." });
    form.createDiv({ cls: "orbitkit-field-hint", text: `Created ${new Date(idea.created).toLocaleString()}` });

    const save = handleAsync(
      "Could not update the idea",
      guarded(async () => {
        if (!titleInput.value.trim()) {
          new Notice("An idea needs a title.");
          titleInput.focus();
          return;
        }
        await controller.updateIdea(idea.id, {
          title: titleInput.value,
          content: details.value,
          status,
          category,
          tags: tags.value,
        });
        this.close();
      }),
    );

    addButtonRow(this.contentEl, [
      {
        text: "Delete",
        variant: "warning",
        onClick: handleAsync("Could not delete the idea", async () => {
          if (await controller.deleteIdea(idea)) this.close();
        }),
      },
      {
        text: "Open note",
        onClick: handleAsync("Could not open the note", async () => {
          this.close();
          await controller.openIdeaNote(idea);
        }),
      },
      { text: "Cancel", onClick: () => this.close() },
      { text: "Save", variant: "cta", onClick: save },
    ]);
    onModEnter(this.contentEl, save);
    titleInput.focus();
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}

export class RandomIdeaModal extends Modal {
  constructor(
    app: App,
    private readonly controller: IdeaVaultController,
    private readonly idea: Idea,
  ) {
    super(app);
  }

  override onOpen(): void {
    const { idea, controller } = this;
    this.setTitle("🎲 From the vault");
    this.contentEl.addClass("idea-vault-modal");

    const card = this.contentEl.createDiv({ cls: `orbitkit-card is-static idea-vault-card is-${idea.status}` });
    card.createEl("h3", { cls: "orbitkit-card-title", text: `${statusOf(idea.status).icon} ${idea.title}` });
    if (idea.content) card.createDiv({ cls: "orbitkit-card-body", text: idea.content });
    card.createDiv({ cls: "orbitkit-card-meta", text: `Created ${new Date(idea.created).toLocaleDateString()}` });
    renderIdeaPills(card, idea);

    addButtonRow(this.contentEl, [
      { text: "Close", onClick: () => this.close() },
      {
        text: "🎲 Another",
        onClick: () => {
          this.close();
          controller.showRandomIdea(idea.id);
        },
      },
      {
        text: "🔥 Mark hot",
        onClick: handleAsync("Could not update the idea", async () => {
          await controller.updateIdea(idea.id, { status: "hot" }, "Marked as hot");
          this.close();
        }),
      },
      {
        text: "✏️ Edit",
        variant: "cta",
        onClick: () => {
          this.close();
          controller.openEdit(idea);
        },
      },
    ]);
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
