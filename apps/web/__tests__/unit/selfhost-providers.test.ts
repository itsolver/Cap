import { serverEnv } from "@cap/env";
import { describe, expect, it, vi } from "vitest";
import { getAiProvider } from "@/lib/ai-provider";
import { getTranscriptionProvider } from "@/lib/transcription-provider";

vi.mock("@cap/env", () => ({
	serverEnv: vi.fn(),
}));

describe("self-host provider selection", () => {
	it("uses local Whisper when it is explicitly configured", () => {
		vi.mocked(serverEnv).mockReturnValue({
			CAP_TRANSCRIPTION_PROVIDER: "local-whisper",
			CAP_WHISPER_ASR_URL: "http://whisper:9000",
		} as ReturnType<typeof serverEnv>);

		expect(getTranscriptionProvider()).toBe("local-whisper");
	});

	it("falls back to local Whisper when only the local ASR URL exists", () => {
		vi.mocked(serverEnv).mockReturnValue({
			CAP_WHISPER_ASR_URL: "http://whisper:9000",
		} as ReturnType<typeof serverEnv>);

		expect(getTranscriptionProvider()).toBe("local-whisper");
	});

	it("uses Ollama when it is explicitly configured", () => {
		vi.mocked(serverEnv).mockReturnValue({
			CAP_AI_PROVIDER: "ollama",
			CAP_OLLAMA_URL: "http://ollama:11434",
		} as ReturnType<typeof serverEnv>);

		expect(getAiProvider()).toBe("ollama");
	});

	it("rejects API providers without their required token", () => {
		vi.mocked(serverEnv).mockReturnValue({
			CAP_AI_PROVIDER: "groq",
		} as ReturnType<typeof serverEnv>);

		expect(getAiProvider()).toBeNull();
	});
});
