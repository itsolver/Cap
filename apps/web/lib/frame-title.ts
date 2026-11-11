import { spawn } from "node:child_process";
import { db } from "@cap/database";
import { videos } from "@cap/database/schema";
import type { VideoMetadata } from "@cap/database/types";
import { serverEnv } from "@cap/env";
import { Storage } from "@cap/web-backend/src/Storage/index";
import { Video } from "@cap/web-domain";
import { and, eq, sql } from "drizzle-orm";
import { decodeStorageVideo } from "@/lib/video-storage";
import { runWorkflowPromise } from "@/lib/workflow-runtime";
import { shouldReplaceVideoTitle } from "@/workflows/generate-ai";

const FRAME_POSITIONS = [0.1, 0.35, 0.6, 0.85];
const TITLE_MODEL = "haiku";
const CLAUDE_TIMEOUT_MS = 120_000;

const PROMPT = `These are frames from a screen recording made by an IT support technician.
Write a title for the recording that says what is being shown or done, in at most 8 words.
Name the app, site or setting visible on screen when it is clear. Use sentence case.
Reply with the title only, no quotes or trailing punctuation.`;

async function fetchFrame(videoUrl: string, timestamp: number) {
	const env = serverEnv();
	const response = await fetch(`${env.MEDIA_SERVER_URL}/video/thumbnail`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-media-server-secret": env.MEDIA_SERVER_WEBHOOK_SECRET as string,
		},
		body: JSON.stringify({
			videoUrl,
			timestamp,
			width: 1280,
			height: 720,
			quality: 70,
		}),
	});
	if (!response.ok) {
		throw new Error(`Frame at ${timestamp}s failed: ${response.status}`);
	}
	return Buffer.from(await response.arrayBuffer()).toString("base64");
}

function askClaude(frames: string[]): Promise<string> {
	const message = {
		type: "user",
		message: {
			role: "user",
			content: [
				...frames.map((data) => ({
					type: "image",
					source: { type: "base64", media_type: "image/jpeg", data },
				})),
				{ type: "text", text: PROMPT },
			],
		},
	};

	return new Promise((resolve, reject) => {
		const child = spawn(
			"claude",
			[
				"-p",
				"--model",
				TITLE_MODEL,
				"--input-format",
				"stream-json",
				"--output-format",
				"stream-json",
				"--verbose",
				"--max-turns",
				"1",
				"--tools",
				"",
			],
			{
				env: {
					NODE_ENV: "production",
					PATH: process.env.PATH ?? "",
					HOME: process.env.HOME ?? "/tmp",
					USE_BUILTIN_RIPGREP: "0",
					CLAUDE_CODE_OAUTH_TOKEN: serverEnv().CLAUDE_CODE_OAUTH_TOKEN ?? "",
				},
				stdio: ["pipe", "pipe", "pipe"],
			},
		);
		const timer = setTimeout(() => child.kill(), CLAUDE_TIMEOUT_MS);
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("close", (code) => {
			clearTimeout(timer);
			const result = stdout
				.split("\n")
				.filter(Boolean)
				.map((line) => {
					try {
						return JSON.parse(line);
					} catch {
						return null;
					}
				})
				.find((event) => event?.type === "result");
			if (result?.subtype === "success" && typeof result.result === "string") {
				resolve(result.result);
				return;
			}
			reject(
				new Error(
					`claude exited ${code}: ${result?.subtype ?? stderr.slice(0, 300)}`,
				),
			);
		});
		child.stdin.end(`${JSON.stringify(message)}\n`);
	});
}

function cleanTitle(raw: string) {
	return (raw.trim().split("\n")[0] ?? "")
		.replace(/^["'“]+|["'”.]+$/g, "")
		.trim()
		.slice(0, 100);
}

export async function applyFrameTitle(videoId: string): Promise<void> {
	const env = serverEnv();
	if (
		!env.CLAUDE_CODE_OAUTH_TOKEN ||
		!env.MEDIA_SERVER_URL ||
		!env.MEDIA_SERVER_WEBHOOK_SECRET
	) {
		return;
	}

	try {
		const [video] = await db()
			.select()
			.from(videos)
			.where(eq(videos.id, Video.VideoId.make(videoId)));
		if (!video) return;

		const metadata = (video.metadata as VideoMetadata) || {};
		if (metadata.frameTitle) return;
		if (
			!shouldReplaceVideoTitle({
				currentTitle: video.name,
				nextAiTitle: "pending",
				sourceName: metadata.sourceName,
				titleManuallyEdited: metadata.titleManuallyEdited,
			})
		) {
			return;
		}

		const duration = Number(video.duration);
		if (!Number.isFinite(duration) || duration <= 0) return;

		const [bucket] = await Storage.getAccessForVideo(
			decodeStorageVideo(video),
		).pipe(runWorkflowPromise);
		const videoUrl = await bucket
			.getInternalSignedObjectUrl(`${video.ownerId}/${videoId}/result.mp4`, {
				expiresIn: 600,
			})
			.pipe(runWorkflowPromise);

		const frames = await Promise.all(
			FRAME_POSITIONS.map((position) =>
				fetchFrame(videoUrl, duration * position),
			),
		);
		const title = cleanTitle(await askClaude(frames));
		if (!title) return;

		await db()
			.update(videos)
			.set({
				name: title,
				metadata: sql`JSON_SET(COALESCE(${videos.metadata}, JSON_OBJECT()), '$.frameTitle', ${title})`,
			})
			.where(
				and(
					eq(videos.id, Video.VideoId.make(videoId)),
					eq(videos.name, video.name),
				),
			);
		console.log("[frame-title] Titled video", { videoId, title });
	} catch (error) {
		console.warn("[frame-title] Failed", {
			videoId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
