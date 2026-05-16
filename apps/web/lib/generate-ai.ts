import { db } from "@cap/database";
import { videos } from "@cap/database/schema";
import type { VideoMetadata } from "@cap/database/types";
import { serverEnv } from "@cap/env";
import type { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { getAiProvider } from "@/lib/ai-provider";
import {
	generateAiWorkflow,
	processAiGeneration,
} from "@/workflows/generate-ai";

type GenerateAiResult = {
	success: boolean;
	message: string;
};

export async function startAiGeneration(
	videoId: Video.VideoId,
	userId: string,
): Promise<GenerateAiResult> {
	if (!getAiProvider()) {
		return {
			success: false,
			message: "Missing AI provider configuration",
		};
	}

	if (!userId || !videoId) {
		return {
			success: false,
			message: "userId or videoId not supplied",
		};
	}

	const query = await db()
		.select({ video: videos })
		.from(videos)
		.where(eq(videos.id, videoId));

	if (query.length === 0 || !query[0]?.video) {
		return { success: false, message: "Video does not exist" };
	}

	const { video } = query[0];

	if (video.transcriptionStatus !== "COMPLETE") {
		return {
			success: false,
			message: "Transcription not complete",
		};
	}

	const metadata = (video.metadata as VideoMetadata) || {};

	if (
		metadata.aiGenerationStatus === "PROCESSING" ||
		metadata.aiGenerationStatus === "QUEUED"
	) {
		return {
			success: true,
			message: "AI generation already in progress",
		};
	}

	if (
		metadata.aiGenerationStatus === "COMPLETE" &&
		(metadata.aiTitle || (metadata.summary && metadata.chapters))
	) {
		return {
			success: true,
			message: "AI metadata already generated",
		};
	}

	try {
		await db()
			.update(videos)
			.set({
				metadata: {
					...metadata,
					aiGenerationStatus: "QUEUED",
				},
			})
			.where(eq(videos.id, videoId));

		const workflowPayload = { videoId, userId };

		if (serverEnv().CAP_SELF_HOST_DIRECT_VIDEO_PROCESSING) {
			startDirectAiGeneration(workflowPayload);
		} else {
			await start(generateAiWorkflow, [workflowPayload]);
		}

		return {
			success: true,
			message: "AI generation workflow started",
		};
	} catch {
		await db()
			.update(videos)
			.set({
				metadata: {
					...metadata,
					aiGenerationStatus: "ERROR",
				},
			})
			.where(eq(videos.id, videoId));

		return {
			success: false,
			message: "Failed to start AI generation workflow",
		};
	}
}

function startDirectAiGeneration(
	payload: Parameters<typeof processAiGeneration>[0],
) {
	queueMicrotask(() => {
		processAiGeneration(payload).catch(async (error) => {
			console.error("[startAiGeneration] Direct AI generation failed:", error);

			try {
				const [video] = await db()
					.select({ metadata: videos.metadata })
					.from(videos)
					.where(eq(videos.id, payload.videoId as Video.VideoId))
					.limit(1);

				const metadata = (video?.metadata as VideoMetadata) || {};
				await db()
					.update(videos)
					.set({
						metadata: {
							...metadata,
							aiGenerationStatus: "ERROR",
						},
					})
					.where(eq(videos.id, payload.videoId as Video.VideoId));
			} catch (updateError) {
				console.error(
					"[startAiGeneration] Failed to mark direct AI error:",
					updateError,
				);
			}
		});
	});
}
