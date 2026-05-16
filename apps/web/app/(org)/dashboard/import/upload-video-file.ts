import type { Folder, Organisation } from "@cap/web-domain";
import { toast } from "sonner";
import { createVideoForServerProcessing } from "@/actions/video/create-for-processing";
import { triggerVideoProcessing } from "@/actions/video/trigger-processing";
import { sendProgressUpdate } from "@/app/(org)/dashboard/caps/components/sendProgressUpdate";
import type { UploadStatus } from "@/app/(org)/dashboard/caps/UploadingContext";
import { uploadWithTarget } from "@/utils/upload-target";

export function isVideoUploadFile(file: File) {
	return (
		file.type.startsWith("video/") ||
		/\.(mov|mp4|avi|mkv|webm|m4v)$/i.test(file.name)
	);
}

export async function uploadVideoForServerProcessing(
	file: File,
	folderId: Folder.FolderId | undefined,
	orgId: Organisation.OrganisationId,
	setUploadStatus: (state: UploadStatus | undefined) => void,
) {
	try {
		setUploadStatus({ status: "parsing" });

		let duration: number | undefined;
		let resolution: string | undefined;

		try {
			const parser = await import("@remotion/media-parser");
			const metadata = await parser.parseMedia({
				src: file,
				fields: {
					durationInSeconds: true,
					dimensions: true,
				},
			});

			duration = metadata.durationInSeconds
				? Math.round(metadata.durationInSeconds)
				: undefined;
			resolution = metadata.dimensions
				? `${metadata.dimensions.width}x${metadata.dimensions.height}`
				: undefined;
		} catch (parseError) {
			console.warn(
				"Failed to parse video metadata, continuing without it:",
				parseError,
			);
		}

		setUploadStatus({ status: "creating" });
		const videoData = await createVideoForServerProcessing({
			duration,
			resolution,
			folderId,
			orgId,
		});

		const uploadId = videoData.id;

		setUploadStatus({
			status: "uploadingVideo",
			capId: uploadId,
			progress: 0,
			thumbnailUrl: undefined,
		});

		const progressTracker = createProgressTracker(uploadId);

		try {
			await uploadWithTarget({
				target: videoData.uploadTarget,
				body: file,
				fileName: file.name,
				onProgress: ({ loaded, total }) => {
					const percent = (loaded / total) * 100;
					setUploadStatus({
						status: "uploadingVideo",
						capId: uploadId,
						progress: percent,
						thumbnailUrl: undefined,
					});

					progressTracker.scheduleProgressUpdate(loaded, total);
				},
			});
			progressTracker.cleanup();
			const total = progressTracker.getTotal() || 1;
			void sendProgressUpdate(uploadId, total, total);
		} catch (uploadError) {
			progressTracker.cleanup();
			throw uploadError;
		}

		setUploadStatus({
			status: "serverProcessing",
			capId: uploadId,
		});

		try {
			await triggerVideoProcessing({
				videoId: uploadId,
				rawFileKey: videoData.rawFileKey,
				bucketId: videoData.bucketId,
			});
		} catch (triggerError) {
			console.error("Failed to trigger processing:", triggerError);
			toast.error("Failed to start video processing. Please try again.");
			setUploadStatus(undefined);
			return false;
		}

		setUploadStatus(undefined);
		toast.success(
			"Video uploaded! Processing will continue in the background.",
		);
		return true;
	} catch (err) {
		console.error("Video upload failed", err);

		if (err instanceof Error && err.message === "upgrade_required") {
			toast.error(
				"Video duration exceeds the limit for free accounts. Please upgrade to Pro.",
			);
		} else {
			toast.error("Failed to upload video. Please try again.");
		}
	}

	setUploadStatus(undefined);
	return false;
}

function createProgressTracker(uploadId: string) {
	const uploadState = {
		videoId: uploadId,
		uploaded: 0,
		total: 0,
		pendingTask: undefined as ReturnType<typeof setTimeout> | undefined,
		lastUpdateTime: Date.now(),
	};

	const scheduleProgressUpdate = (uploaded: number, total: number) => {
		uploadState.uploaded = uploaded;
		uploadState.total = total;
		uploadState.lastUpdateTime = Date.now();

		if (uploadState.pendingTask) {
			clearTimeout(uploadState.pendingTask);
			uploadState.pendingTask = undefined;
		}

		const shouldSendImmediately = uploaded >= total;

		if (!shouldSendImmediately) {
			uploadState.pendingTask = setTimeout(() => {
				if (uploadState.videoId) {
					void sendProgressUpdate(
						uploadState.videoId,
						uploadState.uploaded,
						uploadState.total,
					);
				}
				uploadState.pendingTask = undefined;
			}, 2000);
		}
	};

	const cleanup = () => {
		if (uploadState.pendingTask) {
			clearTimeout(uploadState.pendingTask);
			uploadState.pendingTask = undefined;
		}
	};

	const getTotal = () => uploadState.total;

	return { scheduleProgressUpdate, cleanup, getTotal };
}
