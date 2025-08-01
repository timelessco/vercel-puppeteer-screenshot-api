import {
	StyledButton,
	type StyledButtonProps,
} from "@/components/StyledButton";
import { cn } from "@/utils/index";

interface ToggleButtonProps extends StyledButtonProps {
	isActive: boolean;
	labelOff: string;
	labelOn: string;
	onToggle: () => void;
}

export function ToggleButton({
	className,
	disabled,
	isActive,
	labelOff,
	labelOn,
	onToggle,
	...props
}: ToggleButtonProps) {
	return (
		<StyledButton
			{...props}
			aria-pressed={isActive}
			className={cn(
				"group relative overflow-hidden rounded-xl px-5 py-2.5 shadow-[0_1000px_0_0_hsl(0_0%_20%)_inset] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			disabled={disabled}
			onClick={onToggle}
		>
			<span
				className={`absolute inset-px rounded-[11px] transition-all duration-200 group-hover:bg-neutral-900 ${
					isActive ? "bg-neutral-950" : "bg-neutral-900"
				}`}
			/>

			<span
				className={`relative z-10 flex items-center text-base transition-colors duration-200 ${
					isActive ? "text-white" : "text-neutral-500"
				}`}
			>
				{isActive ? labelOn : labelOff}
			</span>
		</StyledButton>
	);
}
