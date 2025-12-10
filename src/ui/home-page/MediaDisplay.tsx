interface MediaDisplayProps {
	allImageUrls: string[];
	allVideoUrls: string[];
}

export function MediaDisplay({
	allImageUrls,
	allVideoUrls,
}: MediaDisplayProps) {
	const hasMedia = allImageUrls.length > 0 || allVideoUrls.length > 0;

	if (!hasMedia) return null;

	return (
		<div className="mt-6 w-full max-w-4xl space-y-6">
			{/* Twitter Videos */}
			{allVideoUrls.length > 0 && (
				<section
					aria-label="Extracted videos"
					className="rounded-lg border border-gray-100/10 bg-neutral-900/50 backdrop-blur-sm"
				>
					<div className="p-4">
						<h2 className="mb-3 text-lg font-semibold text-neutral-200">
							Videos ({allVideoUrls.length})
						</h2>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							{allVideoUrls.map((videoUrl, index) => (
								<div
									className="overflow-hidden rounded-lg border border-gray-100/5 bg-neutral-950"
									key={videoUrl}
								>
									{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
									<video
										className="w-full"
										controls
										preload="metadata"
										src={videoUrl}
									>
										Your browser does not support the video tag.
									</video>
									<div className="p-2">
										<a
											className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
											href={videoUrl}
											rel="noopener noreferrer"
											target="_blank"
										>
											Open video {index + 1} in new tab ↗
										</a>
									</div>
								</div>
							))}
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
									key={url}
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
	);
}
