import { useCallback, useEffect, useRef, useState } from "react";
import {
	FastForward,
	Pause,
	Play,
	RefreshCw,
	StepForward,
	TerminalSquare,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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

export function DebugPanel() {
	const [started, setStarted] = useState(false);
	const [regs, setRegs] = useState<Registers>({});
	const [bps, setBps] = useState<DebugBreakpoint[]>([]);
	const [insns, setInsns] = useState<DebugInsn[]>([]);
	const [pc, setPc] = useState<number | null>(null);
	const [err, setErr] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const selected = useAnalysisStore((s) => s.selected);
	const pcRef = useRef<HTMLSpanElement>(null);

	const refresh = useCallback(async () => {
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
		} catch (e) {
			setErr(String(e));
		}
	}, []);

	useEffect(() => {
		if (pc != null) {
			pcRef.current?.scrollIntoView({ block: "center" });
		}
	}, [pc, insns]);

	const guard = useCallback(
		async (fn: () => Promise<unknown>) => {
			setBusy(true);
			try {
				await fn();
				await refresh();
			} catch (e) {
				setErr(String(e));
			} finally {
				setBusy(false);
			}
		},
		[refresh],
	);

	const start = () =>
		guard(async () => {
			await api.debugStart();
			await api.debugCommand("ood");
			setStarted(true);
		});

	const cont = () => guard(() => api.debugCommand("dc"));
	const stepIn = () => guard(() => api.debugCommand("ds"));
	const stepOver = () => guard(() => api.debugCommand("dso"));

	const stop = async () => {
		try {
			await api.debugStop();
		} catch {
			/* ignore */
		}
		setStarted(false);
		setRegs({});
		setBps([]);
		setInsns([]);
		setPc(null);
		setErr(null);
	};

	const addBp = async () => {
		if (!selected) return;
		await guard(() => api.debugCommand(`db ${selected.addr}`));
	};

	const regEntries = Object.entries(regs);

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div className="border-border bg-card flex items-center gap-1 border-b px-2 py-1.5">
				<Button
					variant="outline"
					size="sm"
					onClick={start}
					disabled={busy}
					title="Start the program under the debugger"
				>
					<Play /> Start
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={cont}
					disabled={!started || busy}
					title="Continue (dc)"
				>
					<FastForward /> Continue
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={stepOver}
					disabled={!started || busy}
					title="Step over (dso)"
				>
					<StepForward />
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={stepIn}
					disabled={!started || busy}
					title="Step into (ds)"
				>
					<TerminalSquare /> Step
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={addBp}
					disabled={!selected}
					title="Breakpoint at selected function"
				>
					<Pause /> bp @ {fmtAddr(selected?.addr)}
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={refresh}
					disabled={busy}
					title="Refresh"
				>
					<RefreshCw className={busy ? "animate-spin" : ""} />
				</Button>
				<div className="ml-auto">
					<Button
						variant="ghost"
						size="sm"
						onClick={stop}
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

			<div className="grid min-h-0 flex-1 grid-cols-[1fr_220px] overflow-hidden">
				<div className="scroll-host min-h-0 overflow-auto font-mono text-xs">
					{insns.length === 0 && !started && (
						<div className="text-muted-foreground px-3 py-3">
							Start the debugger to disassemble the current
							location.
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
							<span className="w-[9ch] shrink-0">
								{fmtAddr(op.addr)}
							</span>
							<span className="text-muted-foreground w-[16ch] shrink-0 overflow-hidden">
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

					<div className="text-muted-foreground mt-2 border-t border-b px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase">
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
							className="hover:bg-accent px-3 py-px font-mono"
						>
							{fmtAddr(b.addr)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
