import { MessageSquare, Settings, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBinaryStore } from "@/store/binaryStore";
import { useAnalysisStore } from "@/store/analysisStore";
import { useProjectStore } from "@/store/projectStore";
import { useUiStore } from "@/store/uiStore";
import { useSettingsStore } from "@/store/settingsStore";

export function Header() {
	const binary = useBinaryStore((s) => s.binary);
	const busy = useBinaryStore((s) => s.busy);
	const funcs = useAnalysisStore((s) => s.funcs);
	const strings = useAnalysisStore((s) => s.strings);
	const project = useProjectStore((s) => s.current);
	const close = useProjectStore((s) => s.close);
	const chatOpen = useUiStore((s) => s.chatOpen);
	const toggleChat = useUiStore((s) => s.toggleChat);
	const zoomLevel = useSettingsStore((s) => s.zoomLevel);
	const zoomIn = useSettingsStore((s) => s.zoomIn);
	const zoomOut = useSettingsStore((s) => s.zoomOut);
	const resetZoom = useSettingsStore((s) => s.resetZoom);

	const bin = binary?.info?.bin;
	const file = binary?.path.split(/[\\/]/).pop();
	const zoomPct = Math.round(Math.pow(1.2, zoomLevel) * 100);

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
					{project && (
						<Badge
							variant="outline"
							className="text-primary font-mono"
						>
							{project.name}
						</Badge>
					)}
					<Badge
						variant="outline"
						className="text-muted-foreground max-w-[260px] truncate font-mono"
					>
						{file}
					</Badge>
					<Badge variant="secondary">{bin?.arch ?? "?"}</Badge>
					<Badge variant="secondary">
						{bin?.bits ? `${bin.bits}bit` : "?"}
					</Badge>
					<Badge variant="secondary">{funcs.length} funcs</Badge>
					<Badge variant="secondary">{strings.length} strings</Badge>
				</div>
			)}

			<div className="ml-auto flex items-center gap-2">
				{binary && (
					<Button
						variant={chatOpen ? "secondary" : "ghost"}
						size="sm"
						onClick={toggleChat}
						title="Toggle agent chat (Ctrl+L)"
					>
						<MessageSquare /> Chat
					</Button>
				)}
				{binary && (
					<Button
						variant="outline"
						size="sm"
						onClick={close}
						disabled={busy}
					>
						<X /> Close
					</Button>
				)}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" title="Settings">
							<Settings />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>Zoom · {zoomPct}%</DropdownMenuLabel>
						<DropdownMenuItem onClick={zoomIn}>
							Zoom in (Ctrl +)
						</DropdownMenuItem>
						<DropdownMenuItem onClick={zoomOut}>
							Zoom out (Ctrl −)
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={resetZoom}>
							Reset zoom (Ctrl 0)
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
	);
}
