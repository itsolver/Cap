import { describe, expect, it } from "vitest";
import {
	canRetryAiGenerationForMode,
	canStartAiGenerationForMode,
	hasAiResultForMode,
} from "@/lib/ai-metadata";

describe("AI metadata completion rules", () => {
	it("requires a summary for full AI mode even when an AI title exists", () => {
		const metadata = {
			aiGenerationStatus: "COMPLETE",
			aiTitle: "Salesforce Outlook Integration",
		};

		expect(hasAiResultForMode(metadata, false)).toBe(false);
		expect(canStartAiGenerationForMode(metadata, false)).toBe(true);
		expect(canRetryAiGenerationForMode(metadata, false)).toBe(true);
	});

	it("treats title-only mode as complete when an AI title exists", () => {
		const metadata = {
			aiGenerationStatus: "COMPLETE",
			aiTitle: "Salesforce Outlook Integration",
		};

		expect(hasAiResultForMode(metadata, true)).toBe(true);
		expect(canStartAiGenerationForMode(metadata, true)).toBe(false);
		expect(canRetryAiGenerationForMode(metadata, true)).toBe(false);
	});

	it("does not restart queued or processing AI generation", () => {
		expect(
			canRetryAiGenerationForMode({ aiGenerationStatus: "QUEUED" }, false),
		).toBe(false);
		expect(
			canStartAiGenerationForMode({ aiGenerationStatus: "PROCESSING" }, false),
		).toBe(false);
	});

	it("does not require chapters for full AI completion", () => {
		expect(
			hasAiResultForMode(
				{ aiGenerationStatus: "COMPLETE", summary: "Useful summary" },
				false,
			),
		).toBe(true);
	});
});
