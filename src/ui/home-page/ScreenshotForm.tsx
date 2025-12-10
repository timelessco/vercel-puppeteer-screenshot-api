import type { FormEvent } from "react";

import { StyledButton } from "@/components/StyledButton";

import { ToggleButton } from "./ToggleButton";

interface ScreenshotFormProps {
	fullPage: boolean;
	headless: boolean;
	loading: boolean;
	onFullPageToggle: () => void;
	onHeadlessToggle: () => void;
	onSubmit: (e: FormEvent<HTMLFormElement>) => void;
	onVerboseToggle: () => void;
	timeDisplay: string;
	verbose: boolean;
}

export function ScreenshotForm({
	fullPage,
	headless,
	loading,
	onFullPageToggle,
	onHeadlessToggle,
	onSubmit,
	onVerboseToggle,
	timeDisplay,
	verbose,
}: ScreenshotFormProps) {
	return (
		<form
			aria-label="Form to take screenshot"
			className="w-full max-w-2xl"
			onSubmit={onSubmit}
		>
			<div className="flex flex-col space-y-3">
				<label
					className="flex items-center justify-between text-2xl"
					htmlFor="url"
				>
					<span>Site url</span>

					<span className="font-mono text-lg">{timeDisplay}</span>
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
							aria-label={loading ? "Loading screenshot" : "Take screenshot"}
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
							onToggle={onFullPageToggle}
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
						onToggle={onHeadlessToggle}
					/>
				)}
				<ToggleButton
					aria-label={`Verbose mode: ${verbose ? "enabled" : "disabled"}`}
					disabled={loading}
					isActive={verbose}
					labelOff="Verbose: OFF"
					labelOn="Verbose: ON"
					onToggle={onVerboseToggle}
				/>
			</div>
		</form>
	);
}
