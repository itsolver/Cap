import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@cap/database", () => ({
	db: vi.fn(),
}));

vi.mock("@cap/env", () => ({
	serverEnv: vi.fn(() => ({})),
}));

vi.mock("@cap/utils", () => ({
	userIsPro: vi.fn(),
}));

vi.mock("@cap/web-backend", () => ({
	Storage: {},
}));

vi.mock("@deepgram/sdk", () => ({
	createClient: vi.fn(),
}));

vi.mock("@/lib/audio-enhance", () => ({
	ENHANCED_AUDIO_CONTENT_TYPE: "audio/mpeg",
	ENHANCED_AUDIO_EXTENSION: "mp3",
	enhanceAudioFromUrl: vi.fn(),
}));

vi.mock("@/lib/audio-extract", () => ({
	checkHasAudioTrack: vi.fn(),
	extractAudioFromUrl: vi.fn(),
}));

vi.mock("@/lib/generate-ai", () => ({
	startAiGeneration: vi.fn(),
}));

vi.mock("@/lib/media-client", () => ({
	checkHasAudioTrackViaMediaServer: vi.fn(),
	extractAudioViaMediaServer: vi.fn(),
	isMediaServerConfigured: vi.fn(),
	probeVideoViaMediaServer: vi.fn(),
}));

vi.mock("@/lib/server", () => ({
	runPromise: vi.fn(),
}));

vi.mock("@/lib/transcribe-utils", () => ({
	formatToWebVTT: vi.fn(),
}));

vi.mock("@/lib/video-storage", () => ({
	decodeStorageVideo: vi.fn(),
}));

vi.mock("workflow", () => ({
	FatalError: class FatalError extends Error {},
}));

import { serverEnv } from "@cap/env";
import {
	AI_GENERATION_LANGUAGES,
	isAiGenerationLanguage,
	parseAiGenerationLanguage,
} from "@cap/web-domain";
import {
	getDeepgramTranscriptionOptions,
	transcribeWithLocalWhisper,
} from "@/workflows/transcribe";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("AI generation language support", () => {
	it("does not expose unsupported transcription languages", () => {
		expect(AI_GENERATION_LANGUAGES).not.toHaveProperty("pa");
		expect(isAiGenerationLanguage("pa")).toBe(false);
		expect(parseAiGenerationLanguage("pa")).toBe("auto");
	});

	it("constrains Deepgram auto-detection to detectable languages", () => {
		expect(getDeepgramTranscriptionOptions("auto")).toMatchObject({
			model: "nova-3",
			detect_language: expect.arrayContaining(["en", "es", "zh"]),
		});
	});

	it("passes explicit languages to Deepgram", () => {
		expect(getDeepgramTranscriptionOptions("zh")).toMatchObject({
			model: "nova-3",
			language: "zh",
		});
	});

	it("wraps local Whisper plain text responses as VTT", async () => {
		vi.mocked(serverEnv).mockReturnValue({
			CAP_WHISPER_ASR_URL: "http://whisper:9000",
		} as ReturnType<typeof serverEnv>);

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
			})
			.mockResolvedValueOnce({
				ok: true,
				text: async () => "Hello from local Whisper",
			});

		vi.stubGlobal("fetch", fetchMock);

		await expect(
			transcribeWithLocalWhisper("http://media/audio.mp3"),
		).resolves.toBe("WEBVTT\n\nHello from local Whisper");

		const endpoint = fetchMock.mock.calls[1]?.[0];
		expect(endpoint).toBeInstanceOf(URL);
		expect((endpoint as URL).pathname).toBe("/asr");
		expect((endpoint as URL).searchParams.get("output")).toBe("vtt");
		expect((endpoint as URL).searchParams.get("task")).toBe("transcribe");
		expect((endpoint as URL).searchParams.get("encode")).toBe("true");
	});
});
