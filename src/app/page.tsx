"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { GithubIcon } from "@/ui/home-page/GithubIcon";
import { Spotlight } from "@/ui/home-page/Spotlight";
import { ToggleButton } from "@/ui/home-page/ToggleButton";
import { StyledButton } from "@/components/StyledButton";

interface ApiResponse {
	allImages?: Array<{ data: number[] }>;
	metaData?: unknown;
	screenshot?: { data: number[] };
	video_url?: null | string;
}
function bufferToBase64(buffer: number[]): string {
	const base64 = btoa(
		buffer.reduce(
			(acc: string, byte: number) => acc + String.fromCodePoint(byte),
			"",
		),
	);
	return `data:image/png;base64,${base64}`;
}

export default function Home() {
	const [imgUrl, setImgUrl] = useState<string>("");
	const [allImageUrls, setAllImageUrls] = useState<string[]>([]);
	const [video_url, setVideo_url] = useState<null | string>(null);
	const [loading, setLoading] = useState<boolean>(false);
	const [time, setTime] = useState<number>(0);
	const [duration, setDuration] = useState<number>(0);
	const [fullPage, setFullPage] = useState<boolean>(false);
	const [headless, setHeadless] = useState<boolean>(
		process.env.NODE_ENV === "development" ? false : true,
	);
	const [verbose, setVerbose] = useState<boolean>(true);

	useEffect(() => {
		// Cleanup function to revoke object URLs
		return () => {
			if (imgUrl) {
				URL.revokeObjectURL(imgUrl);
			}
			allImageUrls.forEach((url) => {
				URL.revokeObjectURL(url);
			});
		};
	}, [imgUrl, allImageUrls]);

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
		setVideo_url(null);

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

			const data = (await res.json()) as ApiResponse;

			// Revoke previous URLs if exist
			if (imgUrl) {
				URL.revokeObjectURL(imgUrl);
			}
			allImageUrls.forEach((url) => {
				URL.revokeObjectURL(url);
			});

			// Set main screenshot
			if (data.screenshot?.data) {
				const imageUrl = bufferToBase64(data.screenshot.data);
				setImgUrl(imageUrl);
			}

			// Set Instagram carousel images
			if (data.allImages && data.allImages.length > 0) {
				const imageUrls = data.allImages.map((img) => bufferToBase64(img.data));
				setAllImageUrls(imageUrls);
			} else {
				setAllImageUrls([]);
			}

			// Set Twitter video URL
			if (data.video_url) {
				setVideo_url(data.video_url);
			}
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

	const hasAdditionalMedia = allImageUrls.length > 0 || video_url;

	return (
		<main className="relative min-h-screen overflow-auto bg-black bg-grid-white/02">
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

				<form
					aria-label="Form to take screenshot"
					className="w-full max-w-2xl"
					onSubmit={(e) => void handleSubmit(e)}
				>
					<div className="flex flex-col space-y-3">
						<label
							className="flex items-center justify-between text-2xl"
							htmlFor="url"
						>
							<span>Site url</span>

							<span className="font-mono text-lg">{getTimeDisplay()}</span>
						</label>

						<div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
							<input
								aria-label="Enter website URL to screenshot"
								className="flex-1 rounded-xl border border-neutral-800 bg-black/50 px-4 py-2.5 text-lg text-neutral-300 transition-colors duration-200 focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 focus:outline-none"
								disabled={loading}
								id="url"
								name="url"
								placeholder="https://example.com"
								required
								type="url"
							/>

							<div className="flex flex-wrap gap-3">
								<StyledButton
									aria-label={
										loading ? "Loading screenshot" : "Take screenshot"
									}
									className="group relative grid overflow-hidden rounded-xl px-5 py-2.5 shadow-[0_1000px_0_0_hsl(0_0%_20%)_inset] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
									disabled={loading}
									type="submit"
								>
									<span className="absolute inset-0 h-full w-full animate-flip overflow-hidden rounded-xl mask-[linear-gradient(white,transparent_50%)] before:absolute before:inset-[0_auto_auto_50%] before:aspect-square before:w-[200%] before:[translate:-50%_-15%] before:-rotate-90 before:animate-rotate before:bg-[conic-gradient(from_0deg,transparent_0_340deg,white_360deg)]" />

									<span className="absolute inset-px rounded-[11px] bg-neutral-950 transition-all duration-200 group-hover:bg-neutral-900" />

									<span className="z-10 flex items-center space-x-2 text-lg text-neutral-300">
										{loading && (
											<svg
												aria-hidden="true"
												className="animate-spin"
												fill="currentColor"
												height="16"
												viewBox="0 0 256 256"
												width="16"
												xmlns="http://www.w3.org/2000/svg"
											>
												<path d="M232,128a104,104,0,0,1-208,0c0-41,23.81-78.36,60.66-95.27a8,8,0,0,1,6.68,14.54C60.15,61.59,40,93.27,40,128a88,88,0,0,0,176,0c0-34.73-20.15-66.41-51.34-80.73a8,8,0,0,1,6.68-14.54C208.19,49.64,232,87,232,128Z" />
											</svg>
										)}

										<span>{loading ? "Loading..." : "Screenshot"}</span>
									</span>
								</StyledButton>

								<ToggleButton
									aria-label={`Full page capture: ${fullPage ? "enabled" : "disabled"}`}
									disabled={loading}
									isActive={fullPage}
									labelOff="Full Page: OFF"
									labelOn="Full Page: ON"
									onToggle={() => {
										setFullPage((prev) => !prev);
									}}
								/>
							</div>
						</div>
					</div>

					<div className="mt-2 flex flex-wrap gap-2">
						{process.env.NODE_ENV !== "production" && (
							<ToggleButton
								aria-label={`Headless mode: ${headless ? "enabled" : "disabled"}`}
								disabled={loading}
								isActive={headless}
								labelOff="Headless: OFF"
								labelOn="Headless: ON"
								onToggle={() => {
									setHeadless((prev) => !prev);
								}}
							/>
						)}
						<ToggleButton
							aria-label={`Verbose mode: ${verbose ? "enabled" : "disabled"}`}
							disabled={loading}
							isActive={verbose}
							labelOff="Verbose: OFF"
							labelOn="Verbose: ON"
							onToggle={() => {
								setVerbose((prev) => !prev);
							}}
						/>
					</div>
				</form>

				{/* Main Screenshot */}
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

				{/* Additional Media Section */}
				{hasAdditionalMedia && (
					<div className="mt-6 w-full max-w-4xl space-y-6">
						{/* Twitter Video */}
						{video_url && (
							<section
								aria-label="Extracted video"
								className="rounded-lg border border-gray-100/10 bg-neutral-900/50 backdrop-blur-sm"
							>
								<div className="p-4">
									<h2 className="mb-3 text-lg font-semibold text-neutral-200">
										Video
									</h2>
									<div className="overflow-hidden rounded-lg">
										<video
											className="w-xl"
											controls
											preload="metadata"
											src={video_url}
										>
											<track
												default
												kind="captions"
												label="English captions"
												src="no captions"
												srcLang="en"
											/>
											Your browser does not support the video tag.
										</video>
									</div>
									<div className="mt-2 flex items-center gap-2">
										<a
											className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
											href={video_url}
											rel="noopener noreferrer"
											target="_blank"
										>
											Open video in new tab ↗
										</a>
									</div>
								</div>
							</section>
						)}

						{/* All Images */}
						{allImageUrls.length > 0 && (
							<section
								aria-label="All images"
								className="rounded-lg border border-gray-100/10 bg-neutral-900/50 backdrop-blur-sm"
							>
								<div className="p-4">
									<h2 className="mb-3 text-lg font-semibold text-neutral-200">
										All Images ({allImageUrls.length})
									</h2>
									<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
										{allImageUrls.map((url, index) => (
											<div
												className="relative aspect-square overflow-hidden rounded-lg border border-gray-100/5 bg-neutral-950"
												key={index}
											>
												{/* eslint-disable-next-line @next/next/no-img-element */}
												<img
													alt={`twitter post`}
													className="h-full w-full object-cover transition-transform duration-200 hover:scale-105"
													loading="lazy"
													src={url}
												/>
												<div className="absolute right-2 bottom-2 rounded-full bg-black/70 px-2 py-1 text-xs text-white">
													{index + 1}/{allImageUrls.length}
												</div>
											</div>
										))}
									</div>
								</div>
							</section>
						)}
					</div>
				)}
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
