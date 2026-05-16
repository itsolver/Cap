import { serverEnv } from "@cap/env";

export type TranscriptionProvider = "deepgram" | "local-whisper";

export function getTranscriptionProvider(): TranscriptionProvider | null {
	const env = serverEnv();

	if (env.CAP_TRANSCRIPTION_PROVIDER === "deepgram") {
		return env.DEEPGRAM_API_KEY ? "deepgram" : null;
	}

	if (env.CAP_TRANSCRIPTION_PROVIDER === "local-whisper") {
		return env.CAP_WHISPER_ASR_URL ? "local-whisper" : null;
	}

	if (env.CAP_WHISPER_ASR_URL) {
		return "local-whisper";
	}

	if (env.DEEPGRAM_API_KEY) {
		return "deepgram";
	}

	return null;
}
