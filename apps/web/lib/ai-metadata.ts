import type { VideoMetadata } from "@cap/database/types";

export function hasAiResultForMode(
	metadata: VideoMetadata,
	titleOnlyMode: boolean,
) {
	return titleOnlyMode ? Boolean(metadata.aiTitle) : Boolean(metadata.summary);
}

export function canStartAiGenerationForMode(
	metadata: VideoMetadata,
	titleOnlyMode: boolean,
) {
	return (
		metadata.aiGenerationStatus !== "PROCESSING" &&
		metadata.aiGenerationStatus !== "QUEUED" &&
		!hasAiResultForMode(metadata, titleOnlyMode)
	);
}

export function canRetryAiGenerationForMode(
	metadata: VideoMetadata,
	titleOnlyMode: boolean,
) {
	return (
		metadata.aiGenerationStatus !== "PROCESSING" &&
		metadata.aiGenerationStatus !== "QUEUED" &&
		(!hasAiResultForMode(metadata, titleOnlyMode) ||
			!metadata.aiGenerationStatus ||
			metadata.aiGenerationStatus === "ERROR" ||
			metadata.aiGenerationStatus === "SKIPPED")
	);
}
