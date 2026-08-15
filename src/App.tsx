import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { AgentChat } from "@/components/AgentChat";
import { CenterPanel } from "@/components/CenterPanel";
import { Console } from "@/components/Console";
import { FunctionList } from "@/components/FunctionList";
import { Header } from "@/components/Header";
import { pickBinary } from "@/api";
import { useBinaryStore } from "@/store/binaryStore";
import { useLlmStore } from "@/store/llmStore";
import { useUiStore } from "@/store/uiStore";

function App() {
	const binary = useBinaryStore((s) => s.binary);
	const busy = useBinaryStore((s) => s.busy);
	const openBinary = useBinaryStore((s) => s.openBinary);
	const err = useUiStore((s) => s.err);
	const setErr = useUiStore((s) => s.setErr);
	const chatOpen = useUiStore((s) => s.chatOpen);
	const setChatOpen = useUiStore((s) => s.setChatOpen);
	const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		useLlmStore.getState().init();
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
				e.preventDefault();
				setChatOpen(true);
				setTimeout(() => chatInputRef.current?.focus(), 0);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [setChatOpen]);

	return (
		<div className="flex h-full flex-col">
			<Header />

			{err && (
				<div className="border-destructive bg-destructive/15 text-destructive flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs">
					{err}
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setErr(null)}
					>
						✕
					</Button>
				</div>
			)}

			{!binary ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-2">
					<div className="text-primary text-5xl">◈</div>
					<h1 className="text-2xl font-bold">Recurse</h1>
					<p className="text-muted-foreground max-w-md text-center leading-relaxed">
						Agentic reverse engineering on a live analysis session.
						Open a binary to start analyzing.
					</p>
					<Button
						size="lg"
						onClick={async () => {
							const path = await pickBinary();
							if (path) openBinary(path);
						}}
						disabled={busy}
					>
						{busy ? "Analyzing…" : "Open Binary"}
					</Button>
				</div>
			) : (
				<div
					className="grid min-h-0 flex-1 overflow-hidden"
					style={{
						gridTemplateColumns: chatOpen
							? "260px 1fr 340px"
							: "260px 1fr",
					}}
				>
					<aside className="border-border bg-card flex min-w-0 flex-col border-r">
						<FunctionList />
					</aside>

					<CenterPanel />

					{chatOpen && (
						<aside className="border-border bg-card flex min-w-0 flex-col border-l">
							<AgentChat inputRef={chatInputRef} />
						</aside>
					)}
				</div>
			)}

			<Console />
		</div>
	);
}

export default App;
