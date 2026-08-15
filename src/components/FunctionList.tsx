import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAnalysisStore } from "@/store/analysisStore";

function fmtAddr(a: number) {
	return `0x${a.toString(16)}`;
}

export function FunctionList() {
	const funcs = useAnalysisStore((s) => s.funcs);
	const selected = useAnalysisStore((s) => s.selected);
	const selectFn = useAnalysisStore((s) => s.selectFn);
	const [query, setQuery] = useState("");
	const [prevFuncs, setPrevFuncs] = useState(funcs);
	if (prevFuncs !== funcs) {
		setPrevFuncs(funcs);
		setQuery("");
	}

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return funcs;
		return funcs.filter((f) =>
			(f.name ?? f.realname ?? f.signature ?? "")
				.toLowerCase()
				.includes(q),
		);
	}, [funcs, query]);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="text-muted-foreground px-3 py-2 text-[11px] font-semibold tracking-wider uppercase">
				Functions
			</div>
			<div className="px-2 pb-2">
				<Input
					placeholder="Filter functions…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
			</div>
			<ScrollArea className="flex-1">
				<div className="flex flex-col">
					{filtered.map((f) => {
						const name =
							f.name ??
							f.realname ??
							f.signature ??
							`sub_${f.offset.toString(16)}`;
						const active = selected?.offset === f.offset;
						return (
							<button
								key={`${f.offset}-${name}`}
								className={cn(
									"flex items-center gap-2 border-l-2 px-3 py-1 text-left text-xs",
									active
										? "border-primary bg-primary text-primary-foreground"
										: "hover:bg-accent border-transparent",
								)}
								onClick={() => selectFn(f)}
								title={`${name}\n${fmtAddr(f.offset)} · size ${f.size ?? "?"}`}
							>
								<span
									className={cn(
										"font-mono",
										active
											? "text-primary-foreground"
											: "text-primary",
									)}
								>
									{fmtAddr(f.offset)}
								</span>
								<span className="truncate">{name}</span>
							</button>
						);
					})}
					{filtered.length === 0 && (
						<div className="text-muted-foreground px-3 py-3 text-center text-xs">
							no functions
						</div>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}
