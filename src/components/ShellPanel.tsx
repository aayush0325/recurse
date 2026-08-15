import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Terminal as TerminalIcon, X } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import type { ShellInfo } from "@/types";

interface TermRef {
	term: Terminal;
	fit: FitAddon;
}

export function ShellPanel({ active }: { active: boolean }) {
	const [tabs, setTabs] = useState<ShellInfo[]>([]);
	const [activeId, setActiveId] = useState<number | null>(null);
	const termsRef = useRef(new Map<number, TermRef>());
	const tabsRef = useRef<ShellInfo[]>([]);
	const hostRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		tabsRef.current = tabs;
	}, [tabs]);

	const removeTab = useCallback((id: number) => {
		const t = termsRef.current.get(id);
		if (t) {
			t.term.dispose();
			termsRef.current.delete(id);
		}
		const next = tabsRef.current.filter((x) => x.id !== id);
		tabsRef.current = next;
		setTabs(next);
		setActiveId((cur) =>
			cur === id ? (next[next.length - 1]?.id ?? null) : cur,
		);
	}, []);

	useEffect(() => {
		const unlisteners: UnlistenFn[] = [];
		let disposed = false;

		const track = (p: Promise<UnlistenFn>) => {
			p.then((u) => {
				if (disposed) u();
				else unlisteners.push(u);
			});
		};

		track(
			listen("shell-output", (e) => {
				const { id, data } = e.payload as { id: number; data: string };
				termsRef.current.get(id)?.term.write(data);
			}),
		);
		track(
			listen("shell-exit", (e) => {
				const { id } = e.payload as { id: number };
				removeTab(id);
			}),
		);

		return () => {
			disposed = true;
			unlisteners.forEach((u) => u());
		};
	}, [removeTab]);

	const spawn = async () => {
		try {
			const info = await api.shellSpawn();
			setTabs((t) => [...t, info]);
			setActiveId(info.id);
		} catch {
			/* ignore spawn errors */
		}
	};

	const close = (id: number) => {
		api.shellKill(id);
		removeTab(id);
	};

	const attachTerminal = (id: number) => (el: HTMLDivElement | null) => {
		if (!el || termsRef.current.has(id)) return;
		const term = new Terminal({
			fontSize: 12,
			fontFamily:
				'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
			cursorBlink: true,
			scrollback: 5000,
			theme: {
				background: "#0c0c0c",
				foreground: "#d4d4d4",
				cursor: "#d4d4d4",
			},
		});
		const fit = new FitAddon();
		term.loadAddon(fit);
		term.open(el);
		term.onData((d) => {
			api.shellWrite(id, d);
		});
		termsRef.current.set(id, { term, fit });
		fit.fit();
		api.shellResize(id, term.rows, term.cols);
	};

	// Refit the active terminal when it becomes visible or the active shell
	// changes (display:none containers report 0 size otherwise).
	useEffect(() => {
		if (!active || activeId == null) return;
		const raf = requestAnimationFrame(() => {
			const t = termsRef.current.get(activeId);
			if (t) {
				t.fit.fit();
				api.shellResize(activeId, t.term.rows, t.term.cols);
			}
		});
		return () => cancelAnimationFrame(raf);
	}, [active, activeId]);

	// Keep every terminal fitted on container resize.
	useEffect(() => {
		const el = hostRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => {
			for (const [id, t] of termsRef.current) {
				t.fit.fit();
				api.shellResize(id, t.term.rows, t.term.cols);
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="border-border flex items-center gap-0.5 border-b px-1.5 py-1">
				{tabs.map((t) => (
					<div
						key={t.id}
						className={cn(
							"group flex items-center gap-1 rounded px-1 py-0.5 text-xs",
							t.id === activeId ? "bg-accent" : "hover:bg-accent",
						)}
					>
						<button
							type="button"
							className="flex items-center gap-1.5 px-1"
							onClick={() => setActiveId(t.id)}
						>
							<TerminalIcon className="h-3 w-3" />
							{t.name}
						</button>
						<button
							type="button"
							className="text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-hover:opacity-100"
							onClick={() => close(t.id)}
							title="Close shell"
						>
							<X className="h-3 w-3" />
						</button>
					</div>
				))}
				<Button
					variant="ghost"
					size="icon"
					className="h-6 w-6"
					onClick={spawn}
					title="New shell"
				>
					<Plus className="h-3.5 w-3.5" />
				</Button>
			</div>

			<div ref={hostRef} className="relative min-h-0 flex-1 bg-black p-1">
				{tabs.length === 0 && (
					<div className="text-muted-foreground flex h-full items-center justify-center">
						<Button variant="ghost" onClick={spawn}>
							<Plus /> New shell
						</Button>
					</div>
				)}
				{tabs.map((t) => (
					<div
						key={t.id}
						ref={attachTerminal(t.id)}
						className={cn(
							"absolute inset-0",
							t.id !== activeId && "hidden",
						)}
					/>
				))}
			</div>
		</div>
	);
}
