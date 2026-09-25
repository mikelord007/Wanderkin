import { afterEach, describe, expect, it } from "vitest";
import { createCreationRecord } from "../ui/creationFlow.js";
import { loadActiveCreation, loadCreationRecords, saveCreationRecord, setActiveCreationId } from "../ui/creationStorage.js";
import { setCurrentOwnerId } from "./credentials.js";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe("device-local creations per account", () => {
  afterEach(() => setCurrentOwnerId(null));

  it("tags new creations with the signed-in account and hides them from another account", () => {
    const storage = memoryStorage();
    saveCreationRecord(createCreationRecord("legacy"), storage);

    setCurrentOwnerId("user-a");
    saveCreationRecord(createCreationRecord("mine"), storage);
    setActiveCreationId("mine", storage);
    expect(loadCreationRecords(storage).find((record) => record.id === "mine")?.ownerId).toBe("user-a");
    // Records from before sign-in are never retagged or dropped.
    expect(loadCreationRecords(storage).find((record) => record.id === "legacy")?.ownerId).toBeUndefined();
    expect(loadActiveCreation(storage)?.id).toBe("mine");

    setCurrentOwnerId("user-b");
    expect(loadActiveCreation(storage)).toBeNull();
    expect(loadCreationRecords(storage)).toHaveLength(2);
  });
});
