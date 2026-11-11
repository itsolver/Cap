import { serverEnv } from "@cap/env";

export type TranscriptionProvider = "assemblyai" | "local-whisper";

export function getTranscriptionProvider(): TranscriptionProvider | null {
	const env = serverEnv();

	if (env.CAP_TRANSCRIPTION_PROVIDER === "local-whisper") {
		return env.CAP_WHISPER_ASR_URL ? "local-whisper" : null;
	}

	if (env.CAP_TRANSCRIPTION_PROVIDER === "assemblyai") {
		return env.ASSEMBLY_API_KEY ? "assemblyai" : null;
	}

	if (env.ASSEMBLY_API_KEY) return "assemblyai";
	if (env.CAP_WHISPER_ASR_URL) return "local-whisper";

	return null;
}

export function isTranscriptionConfigured() {
	return getTranscriptionProvider() !== null;
}
