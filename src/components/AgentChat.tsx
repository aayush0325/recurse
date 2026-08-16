import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
	ArrowUpDown,
	ChevronDown,
	ChevronRight,
	Eye,
	EyeOff,
	RotateCw,
	Send,
	Trash2,
	Wrench,
	X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";
import { useLlmStore } from "@/store/llmStore";
import {
	useAgentStore,
	type ToolCallUi,
	type UiBlock,
} from "@/store/agentStore";
import { useContextStore } from "@/store/contextStore";
import type { ModelInfo } from "@/types";

type SortMode = "default" | "price-asc" | "price-desc";

function priceOf(m: ModelInfo): number {
	const p = parseFloat(m.prompt_price);
	return Number.isFinite(p) ? p : 0;
}

function fmtPrice(m: ModelInfo): string {
	return `$${(priceOf(m) * 1_000_000).toFixed(2)}/M`;
}

interface Props {
	inputRef?: RefObject<HTMLTextAreaElement | null>;
}

function ToolCallChip({ call }: { call: ToolCallUi }) {
	const [open, setOpen] = useState(false);
	const running = call.result === undefined;
	return (
		<div className="border-border text-muted-foreground rounded border px-2 py-1 text-[11px]">
			<button
				className="flex w-full min-w-0 items-center gap-1.5 text-left"
				onClick={() => setOpen((o) => !o)}
			>
				<Wrench className="h-3 w-3 shrink-0" />
				<span className="shrink-0 font-mono font-semibold">
					{call.name}
				</span>
				{call.arguments && (
					<span className="text-muted-foreground/70 min-w-0 flex-1 truncate font-mono">
						{call.arguments.slice(0, 40)}
					</span>
				)}
				<span className="shrink-0">
					{running ? (
						<span className="text-primary animate-pulse">…</span>
					) : open ? (
						<ChevronDown className="h-3 w-3" />
					) : (
						<ChevronRight className="h-3 w-3" />
					)}
				</span>
			</button>
			{open && call.result !== undefined && (
				<pre className="text-muted-foreground mt-1 max-h-40 overflow-auto border-t pt-1 font-mono text-[10px] break-words whitespace-pre-wrap">
					{call.result}
				</pre>
			)}
		</div>
	);
}

export function AgentChat({ inputRef }: Props) {
	const messages = useAgentStore((s) => s.messages);
	const busy = useAgentStore((s) => s.busy);
	const send = useAgentStore((s) => s.send);
	const reset = useAgentStore((s) => s.reset);

	const items = useContextStore((s) => s.items);
	const removeItem = useContextStore((s) => s.remove);

	const [input, setInput] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);

	const provider = useLlmStore((s) => s.provider);
	const configured = useLlmStore((s) => s.configured);

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
	}, [messages, busy]);

	const doSend = async () => {
		const text = input.trim();
		if (!text || busy) return;
		setInput("");
		const ctxs = useContextStore.getState().items;
		await send(text, ctxs);
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="border-border flex items-center justify-between border-b px-3 py-2">
				<span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
					Agent
				</span>
				<div className="flex items-center gap-1.5">
					<ModelSelector />
					<Button
						variant="ghost"
						size="icon"
						onClick={reset}
						title="Clear conversation"
					>
						<Trash2 />
					</Button>
				</div>
			</div>

			{!configured && (
				<div className="border-border border-b bg-yellow-500/10 px-3 py-1.5 text-[11px] text-yellow-600 dark:text-yellow-500">
					Set your{" "}
					<code className="font-mono">
						{provider.toUpperCase().replace(/_/g, " ")} API key
					</code>{" "}
					via the model menu.
				</div>
			)}

			<div
				ref={scrollRef}
				className="scroll-host flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3"
			>
				{messages.length === 0 && !busy && (
					<div className="text-muted-foreground px-1 py-3 text-center text-xs">
						Ask the agent to analyze the binary — it has a live
						analysis session and can run commands on your behalf.
					</div>
				)}
				{messages.map((m) => (
					<div key={m.id}>
						{m.role === "user" ? (
							<div className="flex justify-end">
								<div className="bg-primary text-primary-foreground max-w-[92%] rounded-lg px-2.5 py-2 text-xs leading-relaxed break-words whitespace-pre-wrap">
									{m.blocks
										.filter((b) => b.kind === "content")
										.map((b) =>
											b.kind === "content" ? b.text : "",
										)
										.join("")}
									{m.contextRefs &&
										m.contextRefs.length > 0 && (
											<div className="mt-1.5 flex flex-wrap gap-1">
												{m.contextRefs.map((ref, i) => (
													<span
														key={i}
														className="bg-primary-foreground/15 rounded px-1 py-px font-mono text-[10px]"
													>
														{ref}
													</span>
												))}
											</div>
										)}
								</div>
							</div>
						) : (
							<AssistantMessage
								blocks={m.blocks}
								pending={m.pending}
								error={m.error}
							/>
						)}
					</div>
				))}
			</div>

			{items.length > 0 && (
				<div className="border-border flex flex-wrap gap-1 border-t px-2 pt-1.5">
					{items.map((it) => (
						<Badge
							key={it.id}
							variant="secondary"
							className="font-mono text-[10px]"
						>
							<span className="max-w-[180px] truncate">
								{it.label}
							</span>
							<button
								className="hover:text-destructive ml-1"
								onClick={() => removeItem(it.id)}
								title="Remove from context"
							>
								<X className="h-3 w-3" />
							</button>
						</Badge>
					))}
				</div>
			)}

			<div className="border-border flex items-end gap-2 border-t p-2.5">
				<Textarea
					ref={inputRef}
					placeholder="e.g. what does sym.main do? disassemble it"
					rows={2}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							doSend();
						}
					}}
				/>
				<Button
					size="icon"
					onClick={doSend}
					disabled={busy || !input.trim()}
					title="Send"
				>
					<Send />
				</Button>
			</div>
		</div>
	);
}

function ReasoningBlock({ text }: { text: string }) {
	const [show, setShow] = useState(true);
	return (
		<div className="text-muted-foreground mb-1.5 border-l-2 pl-2">
			<button
				className="flex items-center gap-1 text-[10px] tracking-wider uppercase"
				onClick={() => setShow((s) => !s)}
			>
				{show ? (
					<ChevronDown className="h-3 w-3" />
				) : (
					<ChevronRight className="h-3 w-3" />
				)}
				thinking
			</button>
			{show && (
				<div className="text-muted-foreground/80 mt-1 break-words whitespace-pre-wrap">
					{text}
				</div>
			)}
		</div>
	);
}

function AssistantMessage({
	blocks,
	pending,
	error,
}: {
	blocks: UiBlock[];
	pending: boolean;
	error?: string;
}) {
	const hasAny = blocks.some(
		(b) => b.kind !== "content" || b.text.length > 0,
	);
	return (
		<div className="max-w-full min-w-0 text-xs leading-relaxed">
			{blocks.map((b, i) => {
				switch (b.kind) {
					case "reasoning":
						return <ReasoningBlock key={i} text={b.text} />;
					case "tool_call":
						return (
							<div key={i} className="mb-1.5">
								<ToolCallChip call={b.call} />
							</div>
						);
					case "content":
						return b.text.length > 0 ? (
							<div key={i} className="mb-1.5">
								<Markdown>{b.text}</Markdown>
							</div>
						) : null;
					default:
						return null;
				}
			})}
			{pending && !hasAny && (
				<span className="text-muted-foreground animate-pulse">…</span>
			)}
			{error && (
				<div className="text-destructive mt-1.5 text-[11px]">
					{error}
				</div>
			)}
		</div>
	);
}

function ModelSelector() {
	const model = useLlmStore((s) => s.model);
	const models = useLlmStore((s) => s.models);
	const loading = useLlmStore((s) => s.modelsLoading);
	const error = useLlmStore((s) => s.modelsError);
	const refresh = useLlmStore((s) => s.refresh);
	const selectModel = useLlmStore((s) => s.selectModel);
	const configured = useLlmStore((s) => s.configured);
	const saveApiKey = useLlmStore((s) => s.saveApiKey);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [key, setKey] = useState("");
	const [show, setShow] = useState(false);
	const [saving, setSaving] = useState(false);
	const [sort, setSort] = useState<SortMode>("default");

	const filtered = useMemo(() => {
		const list = models.filter(
			(m) =>
				m.id.toLowerCase().includes(query.toLowerCase()) ||
				m.name.toLowerCase().includes(query.toLowerCase()),
		);
		if (sort === "price-asc") {
			return [...list].sort((a, b) => priceOf(a) - priceOf(b));
		}
		if (sort === "price-desc") {
			return [...list].sort((a, b) => priceOf(b) - priceOf(a));
		}
		return list;
	}, [models, query, sort]);

	const onSaveKey = async () => {
		setSaving(true);
		await saveApiKey(key);
		setSaving(false);
		if (useLlmStore.getState().keyError === null) setKey("");
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="max-w-[150px] truncate"
				>
					{model || "select model"} ▾
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-hidden p-5 sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Model & Provider</DialogTitle>
				</DialogHeader>

				<div className="space-y-2">
					<label className="text-muted-foreground text-xs">
						OpenRouter API key
					</label>
					<div className="flex gap-1.5">
						<Input
							type={show ? "text" : "password"}
							placeholder={
								configured
									? "•••••• (saved) — replace?"
									: "sk-or-…"
							}
							value={key}
							onChange={(e) => setKey(e.target.value)}
							className="min-w-0 flex-1"
						/>
						<Button
							variant="outline"
							size="icon"
							onClick={() => setShow((s) => !s)}
							title="toggle"
						>
							{show ? <EyeOff /> : <Eye />}
						</Button>
						<Button
							onClick={onSaveKey}
							disabled={saving || !key.trim()}
						>
							{saving ? "…" : "Save"}
						</Button>
					</div>
					{useLlmStore.getState().keySaved &&
						!useLlmStore.getState().keyError && (
							<div className="text-primary text-[11px]">
								saved to ~/.recurse/config.json
							</div>
						)}
					{useLlmStore.getState().keyError && (
						<div className="text-destructive text-[11px]">
							{useLlmStore.getState().keyError}
						</div>
					)}
				</div>

				<div className="flex min-h-0 flex-1 flex-col gap-2">
					<div className="flex items-center gap-1.5">
						<Input
							placeholder={`Search ${models.length} models…`}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							autoFocus
							className="min-w-0 flex-1"
						/>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									title="Sort models"
								>
									<ArrowUpDown />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuLabel>
									Sort by price
								</DropdownMenuLabel>
								<DropdownMenuItem
									onClick={() => setSort("price-asc")}
								>
									Low → High
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => setSort("price-desc")}
								>
									High → Low
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => setSort("default")}
								>
									Default
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						<Button
							variant="outline"
							size="icon"
							onClick={refresh}
							disabled={loading}
							title="Refresh list"
						>
							<RotateCw
								className={loading ? "animate-spin" : ""}
							/>
						</Button>
					</div>
					{error && (
						<div className="border-destructive bg-destructive/10 text-destructive rounded-md border p-2 text-[11px]">
							{error}
						</div>
					)}
					<div className="border-border max-h-[55vh] min-h-0 overflow-x-hidden overflow-y-auto rounded-md border">
						{filtered.map((m) => {
							const active = m.id === model;
							return (
								<button
									key={m.id}
									className={cn(
										"border-border flex w-full min-w-0 items-center justify-between gap-2 border-b px-2.5 py-1.5 text-left text-xs",
										active
											? "bg-primary text-primary-foreground"
											: "hover:bg-accent",
									)}
									onClick={() => {
										selectModel(m.id);
										setOpen(false);
									}}
									title={m.id}
								>
									<span className="min-w-0 flex-1 font-mono break-all">
										{m.id}
									</span>
									<span className="flex shrink-0 gap-1">
										{m.free && (
											<Badge
												variant="secondary"
												className="px-1.5 py-0 text-[9px]"
											>
												free
											</Badge>
										)}
										{!m.free && priceOf(m) > 0 && (
											<Badge
												variant="outline"
												className="px-1.5 py-0 text-[9px]"
											>
												{fmtPrice(m)}
											</Badge>
										)}
										{m.context_length > 0 && (
											<Badge
												variant="outline"
												className="px-1.5 py-0 text-[9px]"
											>
												{Math.round(
													m.context_length / 1000,
												)}
												k
											</Badge>
										)}
									</span>
								</button>
							);
						})}
						{filtered.length === 0 && !loading && (
							<div className="text-muted-foreground px-3 py-3 text-center text-xs">
								no models
							</div>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
