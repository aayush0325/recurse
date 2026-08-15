import { MessageSquare, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pickBinary } from "@/api";
import { useBinaryStore } from "@/store/binaryStore";
import { useUiStore } from "@/store/uiStore";

export function Header() {
	const binary = useBinaryStore((s) => s.binary);
	const busy = useBinaryStore((s) => s.busy);
	const openBinary = useBinaryStore((s) => s.openBinary);
	const closeBinary = useBinaryStore((s) => s.closeBinary);
	const chatOpen = useUiStore((s) => s.chatOpen);
	const toggleChat = useUiStore((s) => s.toggleChat);

	const bin = binary?.info?.bin;
	const file = binary?.path.split(/[\\/]/).pop();

	const onOpen = async () => {
		const path = await pickBinary();
		if (path) openBinary(path);
	};

	return (
		<header className="border-border bg-card flex items-center gap-3 border-b px-3 py-2">
			<div className="flex items-baseline gap-2">
				<span className="text-primary text-lg leading-none">◈</span>
				<span className="text-sm font-bold tracking-wide">Recurse</span>
				<span className="text-muted-foreground text-[11px]">
					agentic reverse engineering
				</span>
			</div>

			{binary && (
				<div className="flex flex-1 items-center gap-1.5 overflow-hidden">
					<Badge
						variant="outline"
						className="text-primary max-w-[260px] truncate font-mono"
					>
						{file}
					</Badge>
					<Badge variant="secondary">{bin?.arch ?? "?"}</Badge>
					<Badge variant="secondary">
						{bin?.bits ? `${bin.bits}bit` : "?"}
					</Badge>
					<Badge variant="secondary">
						{binary.function_count} funcs
					</Badge>
					<Badge variant="secondary">
						{binary.string_count} strings
					</Badge>
				</div>
			)}

			<div className="ml-auto flex items-center gap-2">
				<Button
					variant={chatOpen ? "secondary" : "ghost"}
					size="sm"
					onClick={toggleChat}
					title="Toggle agent chat (Ctrl+L)"
				>
					<MessageSquare /> Chat
				</Button>
				{binary && (
					<Button
						variant="outline"
						size="sm"
						onClick={closeBinary}
						disabled={busy}
					>
						<X /> Close
					</Button>
				)}
				<Button size="sm" onClick={onOpen} disabled={busy}>
					{busy ? "Analyzing…" : "Open Binary"}
				</Button>
			</div>
		</header>
	);
}
