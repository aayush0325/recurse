import { RefreshCw, X } from "lucide-react";
import {
	lazy,
	Suspense,
	useLayoutEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAnalysisStore } from "@/store/analysisStore";
import { useUiStore } from "@/store/uiStore";
import type { CenterTab, DecompileAnnotation } from "@/types";

const ShellPanel = lazy(() =>
	import("@/components/ShellPanel").then((m) => ({ default: m.ShellPanel })),
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
}: {
	op: {
		addr: number;
		bytes?: string | null;
		text?: string;
		disasm?: string;
		jump?: number | null;
		ptr?: number | null;
	};
}) {
	const text = op.text ?? op.disasm ?? "";
	return (
		<div className="hover:bg-accent flex gap-3 px-3 py-px whitespace-nowrap">
			<span className="text-primary w-[9ch] shrink-0">
				{fmtAddr(op.addr)}
			</span>
			<span className="text-muted-foreground w-[16ch] shrink-0 overflow-hidden">
				{op.bytes ?? ""}
			</span>
			<span className="text-foreground">
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

	const setTabSafe = (t: string) => setTab(t as CenterTab);

	const scrollRef = useRef<HTMLDivElement>(null);
	const selectedAddr = selected?.addr;
	const [shellMounted, setShellMounted] = useState(false);

	// Mount (and keep mounted) the shell panel the first time the Shell tab is
	// opened, so its terminals survive tab switches. Adjusting state during
	// render is the documented React pattern here (guarded, no effect).
	if (tab === "shell" && !shellMounted) {
		setShellMounted(true);
	}

	// Reset scroll whenever the selected function changes so a new function
	// always renders from the top (no stale scroll position from the previous
	// function's assembly/decompiled view). Runs pre-paint to avoid a flash.
	useLayoutEffect(() => {
		scrollRef.current?.scrollTo({ top: 0 });
	}, [selectedAddr]);

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div className="border-border bg-card flex items-center gap-1 border-b px-1">
				<Tabs value={tab} onValueChange={setTabSafe} className="flex-1">
					<TabsList className="h-9 bg-transparent p-1">
						<TabsTrigger value="disasm">Disassembly</TabsTrigger>
						<TabsTrigger value="strings">Strings</TabsTrigger>
						<TabsTrigger value="imports">Imports</TabsTrigger>
						<TabsTrigger value="shell">Shell</TabsTrigger>
					</TabsList>
				</Tabs>
				{tab === "disasm" && (
					<div className="flex items-center gap-1 pr-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={decompile}
							disabled={decompiling || !selected}
						>
							{decompiling ? "Decompiling…" : "Decompile"}
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
				<div
					ref={scrollRef}
					className="scroll-host min-h-0 min-w-0 flex-1 overflow-auto"
				>
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
										{asm?.size ?? selected.size ?? "?"}{" "}
										bytes
									</span>
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
										Select a function to disassemble it.
									</div>
								)}
								{selected &&
									!asmLoading &&
									(!asm?.ops || asm.ops.length === 0) && (
										<div className="text-muted-foreground px-3 py-3">
											No instructions.
										</div>
									)}
								{asm?.ops?.map((op) => (
									<OpRow key={op.addr} op={op} />
								))}
							</div>
						</>
					)}

					{tab === "strings" && (
						<table className="w-full font-mono text-xs">
							<thead className="bg-card sticky top-0">
								<tr className="text-muted-foreground text-left text-[11px]">
									<th className="px-3 py-1.5">Offset</th>
									<th className="px-3 py-1.5">Type</th>
									<th className="px-3 py-1.5">String</th>
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
									<th className="px-3 py-1.5">Import</th>
								</tr>
							</thead>
							<tbody>
								{imports.map((imp, i) => (
									<tr key={i} className="hover:bg-accent">
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
							{highlight(decompiled, decompiledAnnotations)}
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
			</div>

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
