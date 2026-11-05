import type { App, Plugin } from "obsidian";
import { describe, expect, it } from "vitest";
import { collectControls, MemoryNoteStore } from "@orbitkit/shared/testing";
import { migrateSettings } from "../src/domain/settings";
import { IdeaService } from "../src/services/idea-service";
import { IdeaVaultSettingTab } from "../src/ui/settings-tab";

function setup() {
  const settings = migrateSettings(null);
  let saves = 0;
  const save = () => {
    saves += 1;
    return Promise.resolve();
  };
  const service = new IdeaService(settings, { store: new MemoryNoteStore(), save });
  const tab = new IdeaVaultSettingTab({} as App, {} as Plugin, service, save);
  return { tab, settings, saves: () => saves };
}

describe("Idea Vault settings definitions (Obsidian 1.13+)", () => {
  it("reads and saves every control", async () => {
    const { tab, settings, saves } = setup();
    const keys = collectControls(tab.getSettingDefinitions()).map((control) => control.key);
    expect(keys).toEqual(["ideasFolderPath", "openAfterCapture"]);
    for (const key of keys) expect(tab.getControlValue(key)).toBeDefined();

    await tab.setControlValue("ideasFolderPath", "Research/Ideas");
    await tab.setControlValue("openAfterCapture", false);
    expect(settings).toMatchObject({ ideasFolderPath: "Research/Ideas", openAfterCapture: false });
    expect(saves()).toBe(2);
  });

  it("ignores unknown keys and wrong types", async () => {
    const { tab, settings, saves } = setup();
    await tab.setControlValue("nope", "x");
    await tab.setControlValue("openAfterCapture", "yes");
    expect(settings.openAfterCapture).toBe(true);
    expect(saves()).toBe(0);
  });

  it("refuses folders outside the vault with a kind message", () => {
    const { tab } = setup();
    const folder = collectControls(tab.getSettingDefinitions()).find((control) => control.key === "ideasFolderPath");
    const validate = folder?.validate as (value: string) => string | undefined;
    expect(validate("Research/Ideas")).toBeUndefined();
    expect(validate("")).toBeUndefined();
    expect(validate("../outside")).toMatch(/^Please choose a folder inside this vault/);
  });
});
