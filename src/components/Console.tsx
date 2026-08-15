import { useState } from "react";
import { ChevronRight, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { useBinaryStore } from "@/store/binaryStore";

function render(out: unknown): string {
	if (typeof out === "string") return out;
	try {
		return JSON.stringify(out, null, 2);
	} catch {
		return String(out);
	}
}

export function Console() {
	const enabled = useBinaryStore((s) => s.binary !== null);
	const [cmd, setCmd] = useState("");
	const [lines, setLines] = useState<string[]>([]);
	const [open, setOpen] = useState(false);

	const run = async () => {
		const c = cmd.trim();
		if (!c) return;
		setCmd("");
		setLines((l) => [...l, `> ${c}`]);
		try {
			const out = await api.raw(c);
			setLines((l) => [...l, render(out)]);
		} catch (e) {
			setLines((l) => [...l, `error: ${e}`]);
		}
	};

	return (
		<div className="border-border bg-card border-t">
			<div className="flex items-center gap-2 px-3 py-1">
				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5"
					onClick={() => setOpen((o) => !o)}
				>
					<Terminal className="h-3.5 w-3.5" />
					Console
					<ChevronRight
						className={cn(
							"h-3.5 w-3.5 transition-transform",
							open && "rotate-90",
						)}
					/>
				</Button>
				<span className="text-muted-foreground text-[11px]">
					raw analysis commands
				</span>
				{open && (
					<Input
						className="ml-auto max-w-md flex-1"
						placeholder={
							enabled
								? "e.g. aflj | head, pd 10 @ main, is~malloc"
								: "open a binary first"
						}
						disabled={!enabled}
						value={cmd}
						onChange={(e) => setCmd(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && run()}
					/>
				)}
				{open && (
					<Button
						variant="outline"
						size="sm"
						onClick={run}
						disabled={!enabled || !cmd.trim()}
					>
						Run
					</Button>
				)}
			</div>
			{open && (
				<pre className="border-border text-muted-foreground max-h-44 overflow-auto border-t px-3 py-2 font-mono text-[11px] whitespace-pre-wrap">
					{lines.length === 0 ? "—" : lines.join("\n")}
				</pre>
			)}
		</div>
	);
}
