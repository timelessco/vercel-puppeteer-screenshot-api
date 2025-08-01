import { cn } from "@/utils/index";

interface SpotlightProps {
	className?: string;
	fill?: string;
}

export function Spotlight(props: SpotlightProps) {
	const { className, fill } = props;

	return (
		<svg
			className={cn(
				"pointer-events-none absolute z-1 h-[169%] w-[138%] animate-spotlight opacity-0 lg:w-[84%]",
				className,
			)}
			fill="none"
			viewBox="0 0 3787 2842"
			xmlns="http://www.w3.org/2000/svg"
		>
			<g filter="url(#filter)">
				<ellipse
					cx="1924.71"
					cy="273.501"
					fill={fill ?? "white"}
					fillOpacity="0.21"
					rx="1924.71"
					ry="273.501"
					transform="matrix(-0.822377 -0.568943 -0.568943 0.822377 3631.88 2291.09)"
				></ellipse>
			</g>
			<defs>
				<filter
					colorInterpolationFilters="sRGB"
					filterUnits="userSpaceOnUse"
					height="2840.26"
					id="filter"
					width="3785.16"
					x="0.860352"
					y="0.838989"
				>
					<feFlood floodOpacity="0" result="BackgroundImageFix"></feFlood>
					<feBlend
						in="SourceGraphic"
						in2="BackgroundImageFix"
						mode="normal"
						result="shape"
					></feBlend>
					<feGaussianBlur
						result="effect1_foregroundBlur_1065_8"
						stdDeviation="151"
					></feGaussianBlur>
				</filter>
			</defs>
		</svg>
	);
}
