import { describe, expect, it } from "vitest";
import { repairQuestJson } from "./repair.js";

describe("repairQuestJson", () => {
  it("keeps a clean answer as it is", () => {
    const answer = JSON.stringify({ title: "Forest Colors", intro: "The forest has lost its colors. Bring them back.", objective: "Find every lost color, then enter the portal." });
    expect(repairQuestJson(answer)).toEqual({ ok: true, quest: JSON.parse(answer), text: answer });
  });

  it("finds the JSON inside prose and drops fields nobody asked for", () => {
    const result = repairQuestJson('Sure! {"title":"Dash","objective":"Reach each checkpoint in order.","narrationScript":["hi"],"questId":"x"} Enjoy!');
    expect(result).toEqual({ ok: true, quest: { title: "Dash", objective: "Reach each checkpoint in order." }, text: '{"title":"Dash","objective":"Reach each checkpoint in order."}' });
  });

  it("trims long fields at a sentence or word boundary within their limits", () => {
    const result = repairQuestJson(JSON.stringify({ title: "A ".repeat(60), intro: "Short sentence here. ".repeat(30), objective: "word ".repeat(60) }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quest.title.length).toBeLessThanOrEqual(80);
    expect(result.quest.intro!.length).toBeLessThanOrEqual(320);
    expect(result.quest.intro!.endsWith(".")).toBe(true);
    expect(result.quest.objective.length).toBeLessThanOrEqual(160);
    expect(result.quest.objective.endsWith("…")).toBe(true);
  });

  it("rejects an answer with no JSON, title or objective", () => {
    expect(repairQuestJson("Here is a lovely quest!").ok).toBe(false);
    expect(repairQuestJson(JSON.stringify({ title: "Only a title" })).ok).toBe(false);
    expect(repairQuestJson(JSON.stringify(["title", "objective"])).ok).toBe(false);
  });
});
