import { useEffect, useRef, useState, type RefObject } from "react";
import { Eye, EyeOff, RotateCw, Send, Trash2 } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { useLlmStore } from "@/store/llmStore";

interface Message {
	role: "user" | "assistant";
	content: string;
}

interface Props {
	inputRef?: RefObject<HTMLTextAreaElement | null>;
}

export function AgentChat({ inputRef }: Props) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	const provider = useLlmStore((s) => s.provider);
	const configured = useLlmStore((s) => s.configured);

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
	}, [messages, busy]);

	const send = async () => {
		const text = input.trim();
		if (!text || busy) return;
		setInput("");
		setErr(null);
		setMessages((m) => [...m, { role: "user", content: text }]);
		setBusy(true);
		try {
			const reply = await api.agentChat(text);
			setMessages((m) => [...m, { role: "assistant", content: reply }]);
		} catch (e) {
			setErr(String(e));
		} finally {
			setBusy(false);
		}
	};

	const reset = async () => {
		await api.agentReset();
		setMessages([]);
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
				className="flex flex-1 flex-col gap-2 overflow-y-auto p-3"
			>
				{messages.length === 0 && !busy && (
					<div className="text-muted-foreground px-1 py-3 text-center text-xs">
						Ask the agent to analyze the binary — it has a live
						analysis session and can run commands on your behalf.
					</div>
				)}
				{messages.map((m, i) => (
					<div
						key={i}
						className={cn(
							"max-w-[92%] rounded-lg px-2.5 py-2 text-xs leading-relaxed break-words whitespace-pre-wrap",
							m.role === "user"
								? "bg-primary text-primary-foreground self-end"
								: "border-border bg-background self-start border",
						)}
					>
						{m.content.split("\n").map((line, j) => (
							<div key={j}>{line || "\u00A0"}</div>
						))}
					</div>
				))}
				{busy && (
					<div className="border-border bg-background text-muted-foreground self-start rounded-lg border px-2.5 py-2 text-xs">
						thinking…
					</div>
				)}
				{err && (
					<div className="border-destructive bg-destructive/10 text-destructive rounded-md border p-2 text-[11px]">
						{err}
					</div>
				)}
			</div>

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
							send();
						}
					}}
				/>
				<Button
					size="icon"
					onClick={send}
					disabled={busy || !input.trim()}
					title="Send"
				>
					<Send />
				</Button>
			</div>
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

	const filtered = models.filter(
		(m) =>
			m.id.toLowerCase().includes(query.toLowerCase()) ||
			m.name.toLowerCase().includes(query.toLowerCase()),
	);

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
