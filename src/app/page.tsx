"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import type { GetMetadataReturnType } from "@/lib/puppeteer/core/getMetadata";
import { GithubIcon } from "@/ui/home-page/GithubIcon";
import { MediaDisplay } from "@/ui/home-page/MediaDisplay";
import { ScreenshotForm } from "@/ui/home-page/ScreenshotForm";
import { Spotlight } from "@/ui/home-page/Spotlight";

interface ScreenshotResponseBuffer {
	data: number[];
	type: "buffer";
}

interface ScreenshotResponse {
	allImages: ScreenshotResponseBuffer[];
	allVideos: string[];
	metaData: GetMetadataReturnType;
	screenshot: ScreenshotResponseBuffer;
}

function bufferToBase64(buffer: number[]): string {
	const u8 = new Uint8Array(buffer);
	const CHUNK_SIZE = 32_768; // 32KB chunks to avoid stack overflow
	const chunks: string[] = [];
	for (let i = 0; i < u8.length; i += CHUNK_SIZE) {
		chunks.push(String.fromCodePoint(...u8.subarray(i, i + CHUNK_SIZE)));
	}
	return `data:image/png;base64,${btoa(chunks.join(""))}`;
}

export default function Home() {
	const [imgUrl, setImgUrl] = useState<string>("");
	const [allImageUrls, setAllImageUrls] = useState<string[]>([]);
	const [allVideoUrls, setAllVideoUrls] = useState<string[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [time, setTime] = useState<number>(0);
	const [duration, setDuration] = useState<number>(0);
	const [fullPage, setFullPage] = useState<boolean>(false);
	const [headless, setHeadless] = useState<boolean>(
		process.env.NODE_ENV === "development" ? false : true,
	);
	const [verbose, setVerbose] = useState<boolean>(true);

	useEffect(() => {
		return () => {
			if (imgUrl) {
				URL.revokeObjectURL(imgUrl);
			}
		};
	}, [imgUrl]);

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		const url = formData.get("url") as string;

		if (!url.trim()) {
			alert("Please enter a valid URL");
			return;
		}

		// Validate URL format
		try {
			new URL(url);
		} catch {
			alert("Please enter a valid URL format (e.g., https://example.com)");
			return;
		}

		setDuration(0);
		setTime(0);
		setAllVideoUrls([]);
		setAllImageUrls([]);

		const timePoint = Date.now();
		const intervalTimer = startDuration();

		try {
			setLoading(true);
			const params = new URLSearchParams({
				fullpage: fullPage.toString(),
				url,
			});

			// In production, always use headless mode
			// In development, respect the toggle button state
			if (process.env.NODE_ENV !== "development" || headless) {
				params.append("headless", "true");
			}

			if (verbose) {
				params.append("verbose", "true");
			}

			const res = await fetch(`/try?${params.toString()}`);

			if (!res.ok) {
				throw new Error(`Failed to capture screenshot: ${res.statusText}`);
			}

			const data = (await res.json()) as ScreenshotResponse;

			// Revoke previous URLs if exist
			if (imgUrl) {
				URL.revokeObjectURL(imgUrl);
			}
			allImageUrls.forEach((url) => {
				URL.revokeObjectURL(url);
			});

			// Set main screenshot
			const imageUrl = bufferToBase64(data.screenshot.data);
			setImgUrl(imageUrl);

			// Set all extracted images
			setAllImageUrls(data.allImages.map((img) => bufferToBase64(img.data)));

			// Set Twitter video URLs
			setAllVideoUrls(data.allVideos);
		} catch (error) {
			console.error("Screenshot capture error:", error);
			alert(
				error instanceof Error
					? error.message
					: "Something went wrong. Please try again.",
			);
		} finally {
			// Calculate time in seconds
			setTime(Number(((Date.now() - timePoint) / 1000).toFixed(2)));

			clearInterval(intervalTimer);

			setLoading(false);
		}
	};

	function startDuration(): NodeJS.Timeout {
		return setInterval(() => {
			setDuration((prev) => {
				const newDuration = Number((prev + 0.09).toFixed(3));
				if (newDuration >= 300) {
					return 300;
				}

				return newDuration;
			});
		}, 90);
	}

	function getTimeDisplay(): string {
		if (time) return `${time}s`;
		if (duration) return `${duration}s`;

		return "";
	}

	return (
		<main className="relative min-h-screen overflow-x-hidden overflow-y-auto bg-black bg-grid-white/02">
			<Spotlight
				className="-top-40 left-0 md:-top-20 md:left-60"
				fill="white"
			/>

			<div className="relative z-20 flex w-full flex-col items-center justify-center px-4 py-16 text-white">
				<section
					aria-label="Hero section"
					className="mb-16 max-w-lg text-center"
				>
					<h1 className="bg-opacity-50 bg-linear-to-b from-neutral-50 to-neutral-400 bg-clip-text text-6xl font-bold text-transparent">
						Try screenshot
					</h1>

					<p className="text-md mt-3">
						can now run up to <span className="font-semibold">300 seconds</span>
					</p>
				</section>

				<ScreenshotForm
					fullPage={fullPage}
					headless={headless}
					loading={loading}
					onFullPageToggle={() => {
						setFullPage((prev) => !prev);
					}}
					onHeadlessToggle={() => {
						setHeadless((prev) => !prev);
					}}
					onSubmit={(e) => void handleSubmit(e)}
					onVerboseToggle={() => {
						setVerbose((prev) => !prev);
					}}
					timeDisplay={getTimeDisplay()}
					verbose={verbose}
				/>

				{imgUrl && (
					<section
						aria-label="Screenshot preview"
						className="relative mt-8 w-full max-w-4xl rounded-lg border border-gray-100/10 bg-neutral-900/50 backdrop-blur-sm"
					>
						<div className="relative h-[60vh] w-full">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								alt="Screenshot preview"
								className="absolute inset-0 h-full w-full object-contain"
								loading="lazy"
								src={imgUrl}
							/>
						</div>
					</section>
				)}

				<MediaDisplay allImageUrls={allImageUrls} allVideoUrls={allVideoUrls} />
			</div>

			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black mask-[radial-gradient(ellipse_at_center,transparent_-40%,black)]"
			/>

			<div className="fixed top-4 right-4 z-30 flex items-center space-x-3">
				<a
					aria-label="View project on GitHub"
					className="relative inline-flex overflow-hidden rounded-xl p-px"
					href="https://github.com/timelessco/vercel-puppeteer-screenshot-api"
					rel="noopener noreferrer"
					target="_blank"
				>
					<span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#c2c2c2_0%,#505050_50%,#bebebe_100%)]" />
					<span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-[11px] bg-neutral-950 px-4 py-2 text-sm font-medium text-gray-50 backdrop-blur-3xl transition-colors duration-200 hover:bg-neutral-900">
						<GithubIcon />

						<span className="ml-2">GitHub</span>
					</span>
				</a>
			</div>
		</main>
	);
}
