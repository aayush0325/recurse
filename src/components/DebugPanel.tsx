import { useCallback, useEffect, useRef, useState } from "react";
import {
	FastForward,
	Loader2,
	Pause,
	Play,
	RefreshCw,
	StepForward,
	TerminalSquare,
	Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { useAnalysisStore } from "@/store/analysisStore";
import type { DebugBreakpoint, DebugInsn, Registers } from "@/types";

function fmtAddr(a?: number | null) {
	return typeof a === "number" ? `0x${a.toString(16)}` : "";
}

function findPc(regs: Registers): number | null {
	for (const key of ["pc", "rip", "eip"]) {
		if (typeof regs[key] === "number") return regs[key];
	}
	return null;
}

function commandText(value: unknown): string {
	if (typeof value === "string") return value.trim();
	if (value == null) return "";
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

export function DebugPanel() {
	const [started, setStarted] = useState(false);
	const [regs, setRegs] = useState<Registers>({});
	const [bps, setBps] = useState<DebugBreakpoint[]>([]);
	const [insns, setInsns] = useState<DebugInsn[]>([]);
	const [pc, setPc] = useState<number | null>(null);
	const [err, setErr] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [flavor, setFlavor] = useState<"intel" | "att">("intel");
	const [output, setOutput] = useState<string[]>([]);
	const [outputOpen, setOutputOpen] = useState(true);
	const [stdinInput, setStdinInput] = useState("");

	const selected = useAnalysisStore((s) => s.selected);
	const pcRef = useRef<HTMLSpanElement>(null);

	const refresh = useCallback(async () => {
		console.info("[debug-ui] refresh started");
		try {
			const [r, b, d] = await Promise.all([
				api.debugRegisters(),
				api.debugBreakpoints(),
				api.debugDisassemble(24),
			]);
			setRegs(r ?? {});
			setBps(b ?? []);
			setInsns(d ?? []);
			setPc(findPc(r ?? {}));
			setErr(null);
			console.info("[debug-ui] refresh completed", {
				registers: Object.keys(r ?? {}).length,
				breakpoints: (b ?? []).length,
				instructions: (d ?? []).length,
			});
		} catch (e) {
			console.error("[debug-ui] refresh failed", e);
			setErr(String(e));
		}
	}, []);

	useEffect(() => {
		if (pc != null) {
			pcRef.current?.scrollIntoView({ block: "center" });
		}
	}, [pc, insns]);

	const guard = useCallback(
		async (label: string, fn: () => Promise<unknown>): Promise<boolean> => {
			setBusy(true);
			console.info(`[debug-ui] ${String(label)} started`);
			try {
				const result = await fn();
				if (label === "continue" || label.startsWith("step")) {
					const text = commandText(result);
					if (text) {
						setOutput((prev) => [...prev, text].slice(-8));
						setOutputOpen(true);
					}
				}
				await refresh();
				console.info(`[debug-ui] ${String(label)} completed`);
				return true;
			} catch (e) {
				console.error(`[debug-ui] ${String(label)} failed`, e);
				setErr(String(e));
				return false;
			} finally {
				setBusy(false);
			}
		},
		[refresh],
	);

	const start = () =>
		guard("start", async () => {
			await api.debugStart();
			await api.debugCommand(`e asm.syntax=${flavor}`);
			setStarted(true);
		});

	const cont = () => guard("continue", () => api.debugCommand("dc"));
	const stepIn = () => guard("step-into", () => api.debugCommand("ds"));
	const stepOver = () => guard("step-over", () => api.debugCommand("dso"));

	const stop = async () => {
		console.info("[debug-ui] stop started");
		try {
			await api.debugStop();
		} catch (e) {
			console.error("[debug-ui] stop failed", e);
			setErr(String(e));
			return;
		}
		setStarted(false);
		setRegs({});
		setBps([]);
		setInsns([]);
		setPc(null);
		setOutput([]);
		setStdinInput("");
		setErr(null);
		console.info("[debug-ui] stop completed");
	};

	const addBp = async () => {
		if (!selected) return;
		const exists = bps.some((b) => b.addr === selected.addr);
		await guard("toggle-breakpoint", () =>
			api.debugCommand(
				exists ? `db -${selected.addr}` : `db ${selected.addr}`,
			),
		);
	};

	const removeBp = (addr: number) =>
		guard("remove-breakpoint", () => api.debugCommand(`db -${addr}`));

	const changeFlavor = (next: "intel" | "att") => {
		if (next === flavor || !started || busy) return;
		void guard(`flavor-${next}`, () =>
			api.debugCommand(`e asm.syntax=${next}`),
		).then((ok) => ok && setFlavor(next));
	};

	const sendStdin = async () => {
		if (!stdinInput || !started) return;
		try {
			console.info("[debug-ui] stdin write started");
			await api.debugStdin(`${stdinInput}\n`);
			setStdinInput("");
			console.info("[debug-ui] stdin write completed");
		} catch (e) {
			console.error("[debug-ui] stdin write failed", e);
			setErr(String(e));
		}
	};

	const regEntries = Object.entries(regs);

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div className="border-border bg-card flex flex-nowrap items-center gap-1.5 overflow-x-auto border-b px-3 py-2">
				<div className="mr-2 flex shrink-0 items-center gap-1.5 text-xs">
					<span
						className={cn(
							"h-2 w-2 rounded-full",
							started ? "bg-primary" : "bg-muted-foreground/50",
						)}
					/>
					<span className="text-muted-foreground">
						{started ? (busy ? "Working" : "Paused") : "Stopped"}
					</span>
				</div>
				<Button
					variant="default"
					size="sm"
					className="shrink-0"
					onClick={start}
					disabled={started || busy}
					title="Start the program under the debugger"
				>
					{busy && !started ? (
						<Loader2 className="animate-spin" />
					) : (
						<Play />
					)}
					Start
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="shrink-0"
					onClick={cont}
					disabled={!started || busy}
					title="Continue (dc)"
				>
					<FastForward /> Continue
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="shrink-0"
					onClick={stepOver}
					disabled={!started || busy}
					title="Step over (dso)"
				>
					<StepForward />
					<span className="hidden sm:inline">Step over</span>
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="shrink-0"
					onClick={stepIn}
					disabled={!started || busy}
					title="Step into (ds)"
				>
					<StepForward /> Step into
				</Button>
				<Button
					variant={
						selected && bps.some((b) => b.addr === selected.addr)
							? "secondary"
							: "ghost"
					}
					size="sm"
					className="shrink-0"
					onClick={addBp}
					disabled={!selected || !started || busy}
					title="Toggle breakpoint at selected function"
				>
					<Pause />
					{selected && bps.some((b) => b.addr === selected.addr)
						? "Remove breakpoint"
						: "Breakpoint"}
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="shrink-0"
					onClick={refresh}
					disabled={busy}
					title="Refresh"
				>
					<RefreshCw className={busy ? "animate-spin" : ""} />
				</Button>
				<div className="border-border flex shrink-0 items-center overflow-hidden rounded-md border">
					<button
						type="button"
						className={cn(
							"px-2 py-1 text-[11px]",
							flavor === "intel"
								? "bg-primary text-primary-foreground"
								: "hover:bg-accent",
						)}
						onClick={() => changeFlavor("intel")}
						title="Intel disassembly syntax"
					>
						Intel
					</button>
					<button
						type="button"
						className={cn(
							"px-2 py-1 text-[11px]",
							flavor === "att"
								? "bg-primary text-primary-foreground"
								: "hover:bg-accent",
						)}
						onClick={() => changeFlavor("att")}
						title="AT&T disassembly syntax"
					>
						AT&T
					</button>
				</div>
				<Button
					variant={outputOpen ? "secondary" : "ghost"}
					size="sm"
					className="shrink-0"
					onClick={() => setOutputOpen((open) => !open)}
					title="Toggle program output"
				>
					<TerminalSquare /> Output
					{output.length > 0 ? ` (${output.length})` : ""}
				</Button>
				<div className="ml-auto shrink-0">
					<Button
						variant="destructive"
						size="sm"
						className="shrink-0"
						onClick={stop}
						disabled={!started && !busy}
						title="Stop the debugger"
					>
						Stop
					</Button>
				</div>
			</div>

			{err && (
				<div className="border-destructive bg-destructive/10 text-destructive m-2 rounded-md border p-2 font-mono text-[11px] whitespace-pre-wrap">
					{err}
				</div>
			)}

			{outputOpen && output.length > 0 && (
				<div className="border-border bg-card mx-2 my-2 max-h-36 overflow-auto rounded-md border">
					<div className="text-muted-foreground flex items-center justify-between border-b px-2.5 py-1.5 text-[11px] font-semibold tracking-wider uppercase">
						<span>Program output</span>
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6"
							onClick={() => setOutput([])}
							title="Clear program output"
						>
							<Trash2 className="h-3 w-3" />
						</Button>
					</div>
					<pre className="text-foreground px-2.5 py-2 font-mono text-xs whitespace-pre-wrap">
						{output.join("\n\n")}
					</pre>
				</div>
			)}

			{started && (
				<div className="border-border bg-card flex items-center gap-2 border-b px-2 py-2">
					<Input
						value={stdinInput}
						onChange={(event) => setStdinInput(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								void sendStdin();
							}
						}}
						placeholder="Program stdin"
						className="h-8 min-w-0 flex-1 font-mono text-xs"
					/>
					<Button
						size="sm"
						onClick={() => void sendStdin()}
						disabled={!stdinInput}
					>
						Send input
					</Button>
				</div>
			)}

			<div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_240px] overflow-hidden">
				<div className="scroll-host min-h-0 overflow-auto font-mono text-xs">
					{insns.length === 0 && !started && (
						<div className="text-muted-foreground flex h-full min-h-40 flex-col items-center justify-center gap-2 px-6 text-center text-xs">
							<Play className="text-primary h-5 w-5" />
							<span>
								Start the debugger to inspect execution.
							</span>
						</div>
					)}
					{insns.length === 0 && started && !busy && (
						<div className="text-muted-foreground px-3 py-3 text-xs">
							No instructions available at the current program
							counter.
						</div>
					)}
					{insns.map((op) => (
						<div
							key={op.addr}
							className={cn(
								"flex gap-3 px-3 py-px whitespace-nowrap",
								op.addr === pc && "bg-primary/20 text-primary",
							)}
						>
							<span className="w-[18ch] shrink-0 overflow-hidden text-ellipsis">
								{fmtAddr(op.addr)}
							</span>
							<span className="text-muted-foreground w-[18ch] shrink-0 overflow-hidden text-ellipsis">
								{op.bytes ?? ""}
							</span>
							<span ref={op.addr === pc ? pcRef : undefined}>
								{op.text ?? op.disasm ?? ""}
							</span>
						</div>
					))}
				</div>

				<div className="border-border flex min-h-0 flex-col overflow-y-auto border-l">
					<div className="text-muted-foreground border-b px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase">
						Registers
					</div>
					{regEntries.length === 0 && (
						<div className="text-muted-foreground px-3 py-2 text-[11px]">
							no registers
						</div>
					)}
					{regEntries.map(([k, v]) => (
						<div
							key={k}
							className="hover:bg-accent flex items-center justify-between gap-2 px-3 py-px"
						>
							<span className="text-muted-foreground font-mono">
								{k}
							</span>
							<span className="font-mono">
								{fmtAddr(Number(v))}
							</span>
						</div>
					))}

					<div className="text-muted-foreground mt-3 border-t border-b px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase">
						Breakpoints
					</div>
					{bps.length === 0 && (
						<div className="text-muted-foreground px-3 py-2 text-[11px]">
							none
						</div>
					)}
					{bps.map((b, i) => (
						<div
							key={i}
							className="hover:bg-accent flex items-center gap-2 px-3 py-1 font-mono"
						>
							<span className="min-w-0 flex-1 truncate">
								{fmtAddr(b.addr)}
							</span>
							<Button
								variant="ghost"
								size="icon"
								className="h-6 w-6"
								onClick={() => void removeBp(b.addr)}
								disabled={busy}
								title={`Remove breakpoint at ${fmtAddr(b.addr)}`}
							>
								<Trash2 className="h-3.5 w-3.5" />
							</Button>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
