import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
	ArrowUpDown,
	ChevronDown,
	ChevronRight,
	Eye,
	EyeOff,
	House,
	Plus,
	RotateCw,
	Send,
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
import { useSessionStore } from "@/store/sessionStore";
import type { ModelInfo } from "@/types";

type SortMode = "default" | "price-asc" | "price-desc";

function fmtDate(secs: number): string {
	const d = new Date(secs * 1000);
	return Number.isNaN(d.getTime())
		? ""
		: d.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
			});
}

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
		<div className="border-border/60 bg-muted/30 text-muted-foreground rounded border px-2 py-1 text-[11px]">
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
				<pre className="text-muted-foreground mt-1 max-h-40 overflow-auto pt-1 font-mono text-[10px] break-words whitespace-pre-wrap">
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
	const prevBusy = useRef(false);

	const items = useContextStore((s) => s.items);
	const removeItem = useContextStore((s) => s.remove);
	const sessions = useSessionStore((s) => s.sessions);
	const current = useSessionStore((s) => s.current);
	const sessionsLoading = useSessionStore((s) => s.loading);
	const sessionsError = useSessionStore((s) => s.error);
	const createSession = useSessionStore((s) => s.create);
	const refreshSessions = useSessionStore((s) => s.refresh);

	const [input, setInput] = useState("");
	const [showSessions, setShowSessions] = useState(true);
	const scrollRef = useRef<HTMLDivElement>(null);

	const provider = useLlmStore((s) => s.provider);
	const configured = useLlmStore((s) => s.configured);

	// Refresh after completion so the generated session name appears on home.
	useEffect(() => {
		if (prevBusy.current && !busy) {
			void refreshSessions();
		}
		prevBusy.current = busy;
	}, [busy, refreshSessions]);

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
	}, [messages, busy]);

	const openSessions = () => {
		setShowSessions(true);
		void refreshSessions();
	};

	const startNewChat = async () => {
		if (busy) return;
		await createSession();
		setShowSessions(false);
	};

	const selectSession = async (id: string) => {
		if (busy) return;
		await useSessionStore.getState().select(id);
		setShowSessions(false);
	};

	const doSend = async () => {
		const text = input.trim();
		if (!text || busy) return;
		setInput("");
		setShowSessions(false);
		const ctxs = useContextStore.getState().items;
		const sessionId = useSessionStore.getState().current?.id ?? "";
		await send(text, ctxs, sessionId);
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="border-border/60 bg-background/80 flex items-center justify-between border-b px-4 py-2.5">
				<div className="flex min-w-0 items-center gap-1.5">
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 shrink-0"
						onClick={openSessions}
						title="Sessions home"
						aria-label="Sessions home"
					>
						<House className="h-3.5 w-3.5" />
					</Button>
					<span className="min-w-0 truncate text-xs font-medium">
						{showSessions ? "Sessions" : (current?.name ?? "Chat")}
					</span>
				</div>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={() => void startNewChat()}
						title="New chat"
					>
						<Plus className="h-4 w-4" />
					</Button>
				</div>
			</div>

			{!configured && (
				<div className="border-border/60 border-b bg-yellow-500/10 px-4 py-1.5 text-[11px] text-yellow-600 dark:text-yellow-500">
					Set your{" "}
					<code className="font-mono">
						{provider.toUpperCase().replace(/_/g, " ")} API key
					</code>{" "}
					via the model menu.
				</div>
			)}

			<div
				ref={scrollRef}
				className="scroll-host flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-4"
			>
				{showSessions && (
					<div className="flex flex-col gap-3">
						{sessionsError && (
							<div className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-[11px]">
								{sessionsError}
							</div>
						)}
						{sessionsLoading ? (
							<div className="text-muted-foreground px-2 py-3 text-xs">
								Loading sessions…
							</div>
						) : sessions.length > 0 ? (
							<ul className="border-border/60 bg-card/50 space-y-0.5 overflow-hidden rounded-lg border p-1.5 shadow-sm">
								{sessions.map((s) => {
									const active = current?.id === s.id;
									return (
										<li key={s.id} className="min-w-0">
											<div className="min-w-0 px-1.5 py-1">
												<button
													type="button"
													onClick={() =>
														void selectSession(s.id)
													}
													className={cn(
														"hover:bg-accent/80 focus-visible:ring-ring flex w-full min-w-0 items-start gap-2 overflow-hidden rounded-md px-2.5 py-2 text-left transition-colors hover:shadow-sm focus-visible:ring-1",
														active
															? "bg-accent/75"
															: "",
													)}
												>
													<span className="text-primary mt-1 text-[10px]">
														●
													</span>
													<span className="min-w-0 flex-1 overflow-hidden">
														<span className="block max-w-full truncate text-xs font-medium">
															{s.name}
														</span>
														<span className="text-muted-foreground mt-0.5 block truncate text-[10px]">
															Completed ·{" "}
															{fmtDate(
																s.updated_at,
															)}
														</span>
													</span>
												</button>
											</div>
										</li>
									);
								})}
							</ul>
						) : (
							<div className="border-border/60 bg-card/50 text-muted-foreground rounded-lg border px-3 py-8 text-center text-xs">
								No chats yet. Start one with + above.
							</div>
						)}
					</div>
				)}
				{!showSessions &&
					messages.map((m) => (
						<div key={m.id}>
							{m.role === "user" ? (
								<div className="flex justify-end">
									<div className="bg-primary text-primary-foreground max-w-[92%] rounded-lg px-2.5 py-2 text-xs leading-relaxed break-words whitespace-pre-wrap">
										{m.blocks
											.filter((b) => b.kind === "content")
											.map((b) =>
												b.kind === "content"
													? b.text
													: "",
											)
											.join("")}
										{m.contextRefs &&
											m.contextRefs.length > 0 && (
												<div className="mt-1.5 flex flex-wrap gap-1">
													{m.contextRefs.map(
														(ref, i) => (
															<span
																key={i}
																className="bg-primary-foreground/15 rounded px-1 py-px font-mono text-[10px]"
															>
																{ref}
															</span>
														),
													)}
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

			<div className="border-border/60 flex justify-center border-t px-3 py-2.5">
				<div className="border-border/70 bg-card w-full max-w-[340px] rounded-xl border p-2 shadow-sm">
					{items.length > 0 && (
						<div className="mb-1.5 flex flex-wrap gap-1">
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

					<div className="flex items-end gap-2">
						<Textarea
							ref={inputRef}
							placeholder="e.g. what does sym.main do? disassemble it"
							rows={1}
							className="min-h-10 resize-none border-0 bg-transparent px-1 py-1 shadow-none focus-visible:ring-0"
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
							className="h-7 w-7 shrink-0"
							onClick={doSend}
							disabled={busy || !input.trim()}
							title="Send"
						>
							<Send />
						</Button>
					</div>
					<div className="border-border/50 mt-1 flex items-center border-t pt-1">
						<ModelSelector />
					</div>
				</div>
			</div>
		</div>
	);
}

function ReasoningBlock({ text }: { text: string }) {
	const [show, setShow] = useState(true);
	return (
		<div className="border-primary/50 text-muted-foreground mb-1.5 border-l-2 pl-2">
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
					className="h-7 max-w-[150px] truncate px-1.5 text-[11px]"
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
						<div className="bg-destructive/10 text-destructive rounded-md p-2 text-[11px]">
							{error}
						</div>
					)}
					<div className="bg-muted/20 max-h-[55vh] min-h-0 overflow-x-hidden overflow-y-auto rounded-md">
						{filtered.map((m) => {
							const active = m.id === model;
							return (
								<button
									key={m.id}
									className={cn(
										"flex w-full min-w-0 items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs",
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
