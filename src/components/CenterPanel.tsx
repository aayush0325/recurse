import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnalysisStore } from "@/store/analysisStore";
import { useUiStore } from "@/store/uiStore";
import type { CenterTab } from "@/types";

function fmtAddr(a?: number | null) {
	return typeof a === "number" ? `0x${a.toString(16)}` : "";
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
	const decompileError = useAnalysisStore((s) => s.decompileError);
	const decompiling = useAnalysisStore((s) => s.decompiling);
	const refreshDisasm = useAnalysisStore((s) => s.refreshDisasm);
	const decompile = useAnalysisStore((s) => s.decompile);

	const setTabSafe = (t: string) => setTab(t as CenterTab);

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div className="border-border bg-card flex items-center gap-1 border-b px-1">
				<Tabs value={tab} onValueChange={setTabSafe} className="flex-1">
					<TabsList className="h-9 bg-transparent p-1">
						<TabsTrigger value="disasm">Disassembly</TabsTrigger>
						<TabsTrigger value="strings">Strings</TabsTrigger>
						<TabsTrigger value="imports">Imports</TabsTrigger>
					</TabsList>
				</Tabs>
				<div className="flex items-center gap-1 pr-2">
					{tab === "disasm" && (
						<Button
							variant="ghost"
							size="sm"
							onClick={decompile}
							disabled={decompiling || !selected}
						>
							{decompiling ? "Decompiling…" : "Decompile"}
						</Button>
					)}
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
			</div>

			<div className="min-h-0 min-w-0 flex-1 overflow-auto">
				{tab === "disasm" && (
					<div className="flex min-h-0 flex-col">
						{selected && (
							<div className="border-border bg-card sticky top-0 flex items-baseline gap-3 border-b px-3 py-1.5">
								<span className="font-semibold">
									{selected.name ??
										selected.signature ??
										"unknown"}
								</span>
								<span className="text-muted-foreground font-mono text-[11px]">
									{fmtAddr(selected.addr)} ·{" "}
									{asm?.size ?? selected.size ?? "?"} bytes
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
						{decompiled && (
							<div className="border-border border-t">
								<div className="text-muted-foreground px-3 py-2 text-[11px] font-semibold tracking-wider uppercase">
									Decompiled (pseudo-C)
								</div>
								<pre className="bg-background text-primary max-h-72 overflow-auto px-3 py-2 font-mono text-xs">
									{decompiled}
								</pre>
							</div>
						)}
						{decompileError && (
							<div className="border-destructive bg-destructive/10 text-destructive m-3 rounded-md border p-2.5 font-mono text-[11px] whitespace-pre-wrap">
								{decompileError}
							</div>
						)}
					</div>
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
		</div>
	);
}
