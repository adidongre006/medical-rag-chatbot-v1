import { describe, expect, it } from "vitest";
import { detectEmergency } from "@/lib/safety";

describe("detectEmergency", () => {
  it.each([
    ["I have crushing chest pain", "medical"],
    ["my dad can't breathe", "medical"],
    ["I think she took an overdose", "medical"],
    ["his face is drooping and speech is slurred speech", "medical"],
    ["I want to kill myself", "self-harm"],
    ["thinking about suicide", "self-harm"],
    ["I've been self-harming", "self-harm"],
  ] as const)("flags %j as %s", (text, kind) => {
    expect(detectEmergency(text)).toBe(kind);
  });

  it.each([
    "What are the symptoms of diabetes?",
    "How is hypertension treated?",
    "Explain the stages of wound healing",
    "What causes migraines?",
  ])("ignores %j", (text) => {
    expect(detectEmergency(text)).toBeNull();
  });

  it("prefers the self-harm message when both match", () => {
    expect(detectEmergency("I want to die, I took an overdose")).toBe("self-harm");
  });
});
