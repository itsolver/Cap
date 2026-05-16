"use client";

import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useStore } from "@tanstack/react-store";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useDashboardContext } from "@/app/(org)/dashboard/Contexts";
import {
	type UploadStatus,
	useUploadingContext,
} from "@/app/(org)/dashboard/caps/UploadingContext";
import { UpgradeModal } from "@/components/UpgradeModal";
import {
	isVideoUploadFile,
	uploadVideoForServerProcessing,
} from "./upload-video-file";

export function DashboardVideoDropUpload({
	children,
	className,
	redirectToCaps = false,
}: {
	children: ReactNode;
	className?: string;
	redirectToCaps?: boolean;
}) {
	const router = useRouter();
	const { user, activeOrganization } = useDashboardContext();
	const { uploadingStore, setUploadStatus } = useUploadingContext();
	const uploadStatus = useStore(uploadingStore, (state) => state.uploadStatus);
	const isUploading = !!uploadStatus;
	const dragDepthRef = useRef(0);
	const [isDragOver, setIsDragOver] = useState(false);
	const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

	const uploadFile = useCallback(
		async (file: File) => {
			if (!user || !activeOrganization) return;

			if (isUploading) {
				toast.info("An upload is already in progress.");
				return;
			}

			if (!user.isPro) {
				setUpgradeModalOpen(true);
				return;
			}

			const ok = await uploadVideoForServerProcessing(
				file,
				undefined,
				activeOrganization.organization.id,
				setUploadStatus,
			);

			if (!ok) return;

			if (redirectToCaps) {
				router.push("/dashboard/caps");
			} else {
				router.refresh();
			}
		},
		[
			activeOrganization,
			isUploading,
			redirectToCaps,
			router,
			setUploadStatus,
			user,
		],
	);

	const handleDragEnter = useCallback(
		(event: React.DragEvent) => {
			if (!isFileDrag(event)) return;

			event.preventDefault();
			if (isUploading) return;

			dragDepthRef.current += 1;
			setIsDragOver(true);
		},
		[isUploading],
	);

	const handleDragOver = useCallback(
		(event: React.DragEvent) => {
			if (!isFileDrag(event)) return;

			event.preventDefault();
			event.dataTransfer.dropEffect = isUploading ? "none" : "copy";
			if (!isUploading) setIsDragOver(true);
		},
		[isUploading],
	);

	const handleDragLeave = useCallback((event: React.DragEvent) => {
		if (!isFileDrag(event)) return;

		event.preventDefault();
		dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
		if (dragDepthRef.current === 0) setIsDragOver(false);
	}, []);

	const handleDrop = useCallback(
		async (event: React.DragEvent) => {
			if (!isFileDrag(event)) return;

			event.preventDefault();
			event.stopPropagation();
			dragDepthRef.current = 0;
			setIsDragOver(false);

			if (isUploading) {
				toast.info("An upload is already in progress.");
				return;
			}

			const file = Array.from(event.dataTransfer.files).find(isVideoUploadFile);
			if (!file) {
				toast.error("Please drop a video file.");
				return;
			}

			await uploadFile(file);
		},
		[isUploading, uploadFile],
	);

	const progressPercent = getUploadProgressPercent(uploadStatus);

	return (
		<section
			aria-label="Video upload drop area"
			onDragEnter={handleDragEnter}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			className={`relative ${className ?? ""}`}
		>
			{children}

			{isDragOver && (
				<div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-12/20 p-6 backdrop-blur-[2px] pointer-events-none">
					<div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-lg border border-blue-8 bg-gray-1 px-6 py-5 text-center shadow-xl">
						<div className="flex size-12 items-center justify-center rounded-full bg-blue-3 text-blue-11">
							<FontAwesomeIcon className="size-5" icon={faUpload} />
						</div>
						<div className="flex flex-col gap-1">
							<p className="text-sm font-medium text-gray-12">
								Drop to upload video
							</p>
							<p className="text-xs text-gray-10">
								MP4, MOV, AVI, MKV, WebM, or M4V
							</p>
						</div>
					</div>
				</div>
			)}

			{uploadStatus && (
				<div className="fixed right-5 bottom-5 z-40 w-[min(320px,calc(100vw-40px))] rounded-lg border border-gray-4 bg-gray-1 px-4 py-3 shadow-xl">
					<div className="flex items-center gap-3">
						<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-3 text-gray-10">
							<FontAwesomeIcon className="size-3.5" icon={faUpload} />
						</div>
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-medium text-gray-12">
								{getUploadStatusLabel(uploadStatus)}
							</p>
							{progressPercent !== null && (
								<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-4">
									<div
										className="h-full rounded-full bg-blue-10 transition-all duration-300"
										style={{ width: `${progressPercent}%` }}
									/>
								</div>
							)}
						</div>
					</div>
				</div>
			)}

			<UpgradeModal
				open={upgradeModalOpen}
				onOpenChange={setUpgradeModalOpen}
			/>
		</section>
	);
}

function isFileDrag(event: React.DragEvent) {
	return Array.from(event.dataTransfer.types).includes("Files");
}

function getUploadProgressPercent(uploadStatus: UploadStatus | undefined) {
	if (!uploadStatus || !("progress" in uploadStatus)) return null;
	return Math.round(uploadStatus.progress);
}

function getUploadStatusLabel(uploadStatus: UploadStatus) {
	switch (uploadStatus.status) {
		case "parsing":
			return "Analyzing video...";
		case "creating":
			return "Preparing upload...";
		case "converting":
			return `Converting... ${Math.round(uploadStatus.progress)}%`;
		case "uploadingThumbnail":
			return `Uploading thumbnail... ${Math.round(uploadStatus.progress)}%`;
		case "uploadingVideo":
			return `Uploading... ${Math.round(uploadStatus.progress)}%`;
		case "serverProcessing":
			return "Processing on server...";
	}
}
