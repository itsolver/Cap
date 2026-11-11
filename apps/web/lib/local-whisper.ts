import { serverEnv } from "@cap/env";
import {
	AI_GENERATION_LANGUAGE_AUTO,
	type AiGenerationLanguage,
} from "@cap/web-domain";
import type { AssemblyAIEditWord } from "@/lib/edit-transcript";

type WhisperWord = {
	word?: unknown;
	start?: unknown;
	end?: unknown;
	probability?: unknown;
};

type WhisperResponse = {
	language?: unknown;
	segments?: { words?: WhisperWord[] | null }[] | null;
};

const toMs = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value)
		? Math.round(value * 1000)
		: undefined;

export async function transcribeWithLocalWhisper(
	audio: Buffer,
	language: AiGenerationLanguage,
) {
	const baseUrl = serverEnv().CAP_WHISPER_ASR_URL;
	if (!baseUrl) throw new Error("CAP_WHISPER_ASR_URL is not set");

	const endpoint = new URL("/asr", baseUrl.replace(/\/$/, ""));
	endpoint.searchParams.set("task", "transcribe");
	endpoint.searchParams.set("encode", "true");
	endpoint.searchParams.set("output", "json");
	endpoint.searchParams.set("word_timestamps", "true");
	if (language !== AI_GENERATION_LANGUAGE_AUTO) {
		endpoint.searchParams.set("language", language);
	}

	const formData = new FormData();
	formData.append(
		"audio_file",
		new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }),
		"audio.mp3",
	);

	const response = await fetch(endpoint, { method: "POST", body: formData });
	if (!response.ok) {
		throw new Error(
			`Local Whisper transcription failed: ${response.status} ${response.statusText} ${await response.text()}`,
		);
	}

	const data = (await response.json()) as WhisperResponse;
	const words: AssemblyAIEditWord[] = (data.segments ?? []).flatMap((segment) =>
		(segment.words ?? []).map((word) => ({
			text: word.word,
			start: toMs(word.start),
			end: toMs(word.end),
			confidence: word.probability,
		})),
	);
	const lastEnd = words.reduce(
		(max, word) =>
			typeof word.end === "number" && word.end > max ? word.end : max,
		0,
	);

	return {
		words,
		language_code: data.language,
		speech_model_used: "whisper",
		durationMs: lastEnd,
	};
}
