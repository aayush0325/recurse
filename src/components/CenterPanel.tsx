import { Link2, Loader2, RefreshCw, X } from "lucide-react";
import {
	lazy,
	Suspense,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { callTarget } from "@/lib/calls";
import { api } from "@/api";
import { useAnalysisStore } from "@/store/analysisStore";
import { useContextStore } from "@/store/contextStore";
import { useUiStore } from "@/store/uiStore";
import type { CenterTab, DecompileAnnotation, Function, Xref } from "@/types";

const ShellPanel = lazy(() =>
	import("@/components/ShellPanel").then((m) => ({ default: m.ShellPanel })),
);

const DebugPanel = lazy(() =>
	import("@/components/DebugPanel").then((m) => ({ default: m.DebugPanel })),
);

const GraphPanel = lazy(() =>
	import("@/components/GraphPanel").then((m) => ({ default: m.GraphPanel })),
);

function fmtAddr(a?: number | null) {
	return typeof a === "number" ? `0x${a.toString(16)}` : "";
}

const HL_COLORS: Record<string, string> = {
	keyword: "text-pink-400",
	comment: "text-muted-foreground italic",
	datatype: "text-sky-400",
	function_name: "text-yellow-400",
	function_parameter: "text-orange-300",
	local_variable: "text-purple-300",
	constant_variable: "text-emerald-400",
};

function highlight(
	code: string,
	annotations: DecompileAnnotation[],
): ReactNode[] {
	const cats = new Array<string>(code.length).fill("");
	for (const a of annotations) {
		if (!Number.isFinite(a.start) || !Number.isFinite(a.end)) continue;
		const color = HL_COLORS[a.syntax_highlight ?? a.type ?? ""];
		if (!color) continue;
		for (let i = a.start; i < a.end && i < code.length; i++) {
			cats[i] = color;
		}
	}
	const spans: ReactNode[] = [];
	let i = 0;
	while (i < code.length) {
		const color = cats[i];
		let j = i;
		while (j < code.length && cats[j] === color) j++;
		spans.push(
			color ? (
				<span key={i} className={color}>
					{code.slice(i, j)}
				</span>
			) : (
				code.slice(i, j)
			),
		);
		i = j;
	}
	return spans;
}

function OpRow({
	op,
	target,
	onGoTo,
}: {
	op: {
		addr: number;
		bytes?: string | null;
		text?: string;
		disasm?: string;
		jump?: number | null;
		ptr?: number | null;
	};
	target?: Function | null;
	onGoTo?: (f: Function) => void;
}) {
	const text = op.text ?? op.disasm ?? "";
	const clickable = !!target;
	return (
		<div
			className={cn(
				"flex gap-3 px-3 py-px whitespace-nowrap",
				clickable && "hover:bg-accent/70 cursor-pointer",
			)}
			onClick={clickable && onGoTo ? () => onGoTo(target) : undefined}
			title={
				clickable
					? `Go to ${target.name ?? fmtAddr(target.addr)}`
					: undefined
			}
		>
			<span className="text-primary w-[9ch] shrink-0">
				{fmtAddr(op.addr)}
			</span>
			<span className="text-muted-foreground w-[16ch] shrink-0 overflow-hidden">
				{op.bytes ?? ""}
			</span>
			<span
				className={cn(
					"text-foreground",
					clickable &&
						"text-primary underline decoration-dotted underline-offset-2",
				)}
			>
				{text}
				{typeof op.jump === "number" && (
					<span className="text-amber-500 dark:text-yellow-600">
						{" "}
						→ {fmtAddr(op.jump)}
					</span>
				)}
				{typeof op.ptr === "number" && (
					<span className="text-amber-500 dark:text-yellow-600">
						{" "}
						; [{fmtAddr(op.ptr)}]
					</span>
				)}
			</span>
		</div>
	);
}

export function CenterPanel() {
	const tab = useUiStore((s) => s.tab);
	const setTab = useUiStore((s) => s.setTab);
	const selected = useAnalysisStore((s) => s.selected);
	const funcs = useAnalysisStore((s) => s.funcs);
	const selectFn = useAnalysisStore((s) => s.selectFn);
	const asm = useAnalysisStore((s) => s.asm);
	const asmLoading = useAnalysisStore((s) => s.asmLoading);
	const strings = useAnalysisStore((s) => s.strings);
	const imports = useAnalysisStore((s) => s.imports);
	const decompiled = useAnalysisStore((s) => s.decompiled);
	const decompiledAnnotations = useAnalysisStore(
		(s) => s.decompiledAnnotations,
	);
	const decompileError = useAnalysisStore((s) => s.decompileError);
	const decompiling = useAnalysisStore((s) => s.decompiling);
	const refreshDisasm = useAnalysisStore((s) => s.refreshDisasm);
	const decompile = useAnalysisStore((s) => s.decompile);
	const clearDecompiled = useAnalysisStore((s) => s.clearDecompiled);

	const pending = useContextStore((s) => s.pending);
	const setPending = useContextStore((s) => s.setPending);
	const commitPending = useContextStore((s) => s.commitPending);

	const setTabSafe = (t: string) => setTab(t as CenterTab);

	const scrollRef = useRef<HTMLDivElement>(null);
	const selectedAddr = selected?.addr;
	const [shellMounted, setShellMounted] = useState(false);
	const [debugMounted, setDebugMounted] = useState(false);
	const [viewMode, setViewMode] = useState<"linear" | "graph">("linear");
	const [xrefs, setXrefs] = useState<Xref[]>([]);
	const [xrefsAddress, setXrefsAddress] = useState<number | null>(null);
	const [xrefsOpen, setXrefsOpen] = useState(false);
	const [xrefsLoading, setXrefsLoading] = useState(false);
	const [xrefsError, setXrefsError] = useState<string | null>(null);

	// Address → function lookup so call instructions can resolve to their target.
	const funcByAddr = useMemo(() => {
		const m = new Map<number, Function>();
		for (const f of funcs) {
			if (typeof f.addr === "number") m.set(f.addr, f);
		}
		return m;
	}, [funcs]);

	// Mount (and keep mounted) the shell panel the first time the Shell tab is
	// opened, so its terminals survive tab switches. Adjusting state during
	// render is the documented React pattern here (guarded, no effect).
	if (tab === "shell" && !shellMounted) {
		setShellMounted(true);
	}
	if (tab === "debug" && !debugMounted) {
		setDebugMounted(true);
	}

	// Track text selection in the disassembly / decompiler views so the user
	// can add the selected text to the agent's context (Ctrl+L or the hint).
	const handleSelection = () => {
		requestAnimationFrame(() => {
			const sel = window.getSelection();
			const text = sel?.toString().trim() ?? "";
			if (!text) {
				setPending(null);
				return;
			}
			const anchor = sel?.anchorNode;
			const inView =
				anchor instanceof Node && scrollRef.current?.contains(anchor);
			if (!inView) {
				setPending(null);
				return;
			}
			const source =
				tab === "disasm"
					? "disasm"
					: tab === "debug"
						? "debug"
						: "decompile";
			const label = selected
				? `${fmtAddr(selected.addr)} · ${selected.name ?? "fn"}`
				: "selection";
			setPending({ source, label, text });
		});
	};

	// Reset scroll whenever the selected function changes so a new function
	// always renders from the top (no stale scroll position from the previous
	// function's assembly/decompiled view). Runs pre-paint to avoid a flash.
	useLayoutEffect(() => {
		scrollRef.current?.scrollTo({ top: 0 });
	}, [selectedAddr]);

	const loadXrefs = async () => {
		if (!selected) return;
		const addr = selected.addr;
		setXrefsAddress(addr);
		setXrefsLoading(true);
		setXrefsError(null);
		try {
			const result = await api.xrefsTo(addr);
			if (useAnalysisStore.getState().selected?.addr === addr) {
				setXrefs(result ?? []);
			}
		} catch (e) {
			if (useAnalysisStore.getState().selected?.addr === addr) {
				setXrefsError(String(e));
			}
		} finally {
			setXrefsLoading(false);
		}
	};

	const toggleXrefs = () => {
		if (xrefsOpen && xrefsAddress === selectedAddr) {
			setXrefsOpen(false);
			return;
		}
		setXrefsOpen(true);
		void loadXrefs();
	};

	const currentXrefs = xrefsAddress === selectedAddr ? xrefs : [];
	const currentXrefsError = xrefsAddress === selectedAddr ? xrefsError : null;
	const currentXrefsLoading = xrefsAddress === selectedAddr && xrefsLoading;

	const sourceFunction = (xref: Xref): Function | undefined => {
		if (xref.fcn_name) {
			const byName = funcs.find(
				(f) => f.name === xref.fcn_name || f.realname === xref.fcn_name,
			);
			if (byName) return byName;
		}
		return funcs.find(
			(f) =>
				typeof f.size === "number" &&
				xref.from >= f.addr &&
				xref.from < f.addr + f.size,
		);
	};

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div className="border-border bg-card flex items-center gap-1 border-b px-1">
				<Tabs value={tab} onValueChange={setTabSafe} className="flex-1">
					<TabsList className="h-9 bg-transparent p-1">
						<TabsTrigger value="disasm">Disassembly</TabsTrigger>
						<TabsTrigger value="strings">Strings</TabsTrigger>
						<TabsTrigger value="imports">Imports</TabsTrigger>
						<TabsTrigger value="debug">Debug</TabsTrigger>
						<TabsTrigger value="shell">Shell</TabsTrigger>
					</TabsList>
				</Tabs>
				{tab === "disasm" && (
					<div className="flex items-center gap-1 pr-2">
						<div className="border-border flex overflow-hidden rounded-md border">
							<button
								className={cn(
									"px-2 py-1 text-[11px]",
									viewMode === "linear"
										? "bg-primary text-primary-foreground"
										: "hover:bg-accent",
								)}
								onClick={() => setViewMode("linear")}
								title="Linear disassembly"
							>
								Linear
							</button>
							<button
								className={cn(
									"px-2 py-1 text-[11px]",
									viewMode === "graph"
										? "bg-primary text-primary-foreground"
										: "hover:bg-accent",
								)}
								onClick={() => setViewMode("graph")}
								title="Control-flow graph (pan/zoom)"
							>
								Graph
							</button>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={decompile}
							disabled={decompiling || !selected}
						>
							{decompiling ? "Decompiling…" : "Decompile"}
						</Button>
						<Button
							variant={xrefsOpen ? "secondary" : "ghost"}
							size="sm"
							onClick={toggleXrefs}
							disabled={!selected}
							title="Show incoming cross-references"
						>
							<Link2 className="mr-1 h-3.5 w-3.5" />
							Xrefs
						</Button>
						<Button
							variant="ghost"
							size="icon"
							onClick={refreshDisasm}
							disabled={asmLoading}
							title="Reload"
						>
							<RefreshCw
								className={asmLoading ? "animate-spin" : ""}
							/>
						</Button>
					</div>
				)}
			</div>

			<div
				className={cn(
					"min-h-0 min-w-0 flex-1 flex-col",
					tab === "shell" ? "hidden" : "flex",
				)}
			>
				{tab === "disasm" && viewMode === "graph" && selected ? (
					<Suspense
						fallback={
							<div className="text-muted-foreground px-3 py-3 text-xs">
								loading graph…
							</div>
						}
					>
						<GraphPanel addr={selected.addr} />
					</Suspense>
				) : (
					<>
						<div
							ref={scrollRef}
							onMouseUp={handleSelection}
							className="scroll-host relative min-h-0 min-w-0 flex-1 overflow-auto"
						>
							{pending && (
								<div className="absolute top-2 right-2 z-20 flex items-center gap-1">
									<Button
										size="sm"
										onClick={commitPending}
										className="shadow"
										title="Add selection to agent context (Ctrl+L)"
									>
										+ Add to agent context
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="shadow"
										onClick={() => setPending(null)}
										title="Dismiss"
									>
										<X className="h-3.5 w-3.5" />
									</Button>
								</div>
							)}
							{tab === "disasm" && (
								<>
									{selected && (
										<div className="border-border bg-card sticky top-0 z-10 flex items-baseline gap-3 border-b px-3 py-1.5">
											<span className="font-semibold">
												{selected.name ??
													selected.signature ??
													"unknown"}
											</span>
											<span className="text-muted-foreground font-mono text-[11px]">
												{fmtAddr(selected.addr)} ·{" "}
												{asm?.size ??
													selected.size ??
													"?"}{" "}
												bytes
											</span>
										</div>
									)}
									{xrefsOpen &&
										selected &&
										xrefsAddress === selectedAddr && (
											<div className="border-border bg-card mx-3 my-2 max-h-44 overflow-auto rounded-md border">
												<div className="text-muted-foreground flex items-center justify-between px-2.5 py-1.5 text-[11px]">
													<span>
														Incoming references
													</span>
													<span>
														{currentXrefs.length}
													</span>
												</div>
												{currentXrefsLoading && (
													<div className="text-muted-foreground flex items-center gap-1.5 px-2.5 py-2 text-xs">
														<Loader2 className="h-3.5 w-3.5 animate-spin" />
														Loading xrefs…
													</div>
												)}
												{currentXrefsError && (
													<div className="text-destructive px-2.5 py-2 text-xs">
														{currentXrefsError}
													</div>
												)}
												{!currentXrefsLoading &&
													!currentXrefsError &&
													currentXrefs.length ===
														0 && (
														<div className="text-muted-foreground px-2.5 py-2 text-xs">
															No incoming
															references.
														</div>
													)}
												{currentXrefs.map((xref, i) => {
													const source =
														sourceFunction(xref);
													return (
														<button
															key={`${xref.from}-${i}`}
															type="button"
															disabled={!source}
															onClick={() =>
																source &&
																selectFn(source)
															}
															className={cn(
																"hover:bg-accent flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-[11px] disabled:cursor-default",
																source &&
																	"text-primary",
															)}
															title={
																source
																	? "Go to source function"
																	: undefined
															}
														>
															<span className="w-[9ch] shrink-0">
																{fmtAddr(
																	xref.from,
																)}
															</span>
															<span className="min-w-0 flex-1 truncate">
																{source?.name ??
																	xref.fcn_name ??
																	"unknown function"}
															</span>
															<span className="text-muted-foreground max-w-[45%] truncate">
																{xref.opcode ??
																	xref.type ??
																	"reference"}
															</span>
														</button>
													);
												})}
											</div>
										)}
									<div className="font-mono text-xs">
										{asmLoading && (
											<div className="text-muted-foreground px-3 py-3">
												disassembling…
											</div>
										)}
										{!selected && !asmLoading && (
											<div className="text-muted-foreground px-3 py-3">
												Select a function to disassemble
												it.
											</div>
										)}
										{selected &&
											!asmLoading &&
											(!asm?.ops ||
												asm.ops.length === 0) && (
												<div className="text-muted-foreground px-3 py-3">
													No instructions.
												</div>
											)}
										{asm?.ops?.map((op) => (
											<OpRow
												key={op.addr}
												op={op}
												target={callTarget(
													op,
													funcByAddr,
												)}
												onGoTo={selectFn}
											/>
										))}
									</div>
								</>
							)}

							{tab === "strings" && (
								<table className="w-full font-mono text-xs">
									<thead className="bg-card sticky top-0">
										<tr className="text-muted-foreground text-left text-[11px]">
											<th className="px-3 py-1.5">
												Offset
											</th>
											<th className="px-3 py-1.5">
												Type
											</th>
											<th className="px-3 py-1.5">
												String
											</th>
										</tr>
									</thead>
									<tbody>
										{strings.map((s) => (
											<tr
												key={`${s.vaddr}-${s.string}`}
												className="hover:bg-accent"
											>
												<td className="text-primary px-3 py-px">
													{fmtAddr(s.vaddr)}
												</td>
												<td className="px-3 py-px">
													{s.type ?? ""}
												</td>
												<td
													className="max-w-0 truncate px-3 py-px"
													title={s.string}
												>
													{s.string}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							)}

							{tab === "imports" && (
								<table className="w-full font-mono text-xs">
									<thead className="bg-card sticky top-0">
										<tr className="text-muted-foreground text-left text-[11px]">
											<th className="px-3 py-1.5">
												Import
											</th>
										</tr>
									</thead>
									<tbody>
										{imports.map((imp, i) => (
											<tr
												key={i}
												className="hover:bg-accent"
											>
												<td className="px-3 py-px">
													{imp.name ?? "(unnamed)"}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							)}
						</div>

						{tab === "disasm" && decompiled && (
							<div className="border-border bg-card relative shrink-0 border-t">
								<pre className="scroll-host text-primary h-64 overflow-auto px-3 py-2 font-mono text-xs">
									{highlight(
										decompiled,
										decompiledAnnotations,
									)}
								</pre>
								<Button
									variant="ghost"
									size="icon"
									className="bg-card/80 absolute top-1 right-1 h-6 w-6"
									onClick={clearDecompiled}
									title="Close decompiled view"
								>
									<X className="h-3.5 w-3.5" />
								</Button>
							</div>
						)}

						{tab === "disasm" && decompileError && (
							<div className="border-destructive bg-destructive/10 text-destructive m-3 rounded-md border p-2.5 font-mono text-[11px] whitespace-pre-wrap">
								{decompileError}
							</div>
						)}
					</>
				)}
			</div>

			{debugMounted && (
				<div
					className={cn(
						"min-h-0 min-w-0 flex-1",
						tab !== "debug" && "hidden",
					)}
				>
					<Suspense
						fallback={
							<div className="text-muted-foreground px-3 py-3 text-xs">
								loading debugger…
							</div>
						}
					>
						<DebugPanel />
					</Suspense>
				</div>
			)}

			{shellMounted && (
				<div
					className={cn(
						"min-h-0 min-w-0 flex-1",
						tab !== "shell" && "hidden",
					)}
				>
					<Suspense
						fallback={
							<div className="text-muted-foreground px-3 py-3 text-xs">
								loading shell…
							</div>
						}
					>
						<ShellPanel active={tab === "shell"} />
					</Suspense>
				</div>
			)}
		</div>
	);
}
