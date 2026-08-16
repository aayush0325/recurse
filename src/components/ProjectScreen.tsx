import { ChevronRight, FolderOpen, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/projectStore";
import { useUiStore } from "@/store/uiStore";

function baseName(path: string): string {
	return path.split(/[\\/]/).pop() ?? path;
}

function fmtDate(secs: number): string {
	const d = new Date(secs * 1000);
	return Number.isNaN(d.getTime())
		? ""
		: d.toLocaleDateString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
			});
}

export function ProjectScreen() {
	const projects = useProjectStore((s) => s.projects);
	const loading = useProjectStore((s) => s.loading);
	const openProject = useProjectStore((s) => s.openProject);
	const deleteProject = useProjectStore((s) => s.deleteProject);
	const setNewProjectOpen = useUiStore((s) => s.setNewProjectOpen);

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center overflow-auto px-6 py-14">
			<div className="flex flex-col items-center text-center">
				<div className="text-primary text-5xl leading-none">◈</div>
				<h1 className="mt-5 text-3xl font-bold tracking-tight">
					Recurse
				</h1>
				<p className="text-muted-foreground mt-2 max-w-sm text-sm leading-relaxed">
					Agentic reverse engineering. Resume a project or open a new
					target.
				</p>
			</div>

			<div className="mt-9 flex flex-col items-center gap-2">
				<Button
					size="lg"
					className="h-11 px-10 text-sm tracking-wide"
					onClick={() => setNewProjectOpen(true)}
				>
					<Plus /> New Project
				</Button>
				<span className="text-muted-foreground text-[11px]">
					projects live in{" "}
					<code className="text-primary font-mono">~/.recurse</code>
				</span>
			</div>

			{loading && (
				<div className="text-muted-foreground mt-12 text-xs">
					loading projects…
				</div>
			)}

			{!loading && projects.length > 0 && (
				<div className="mt-12 w-full">
					<div className="flex items-center justify-between px-1">
						<h2 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
							Recent projects
						</h2>
						<span className="text-muted-foreground text-[11px]">
							{projects.length}
						</span>
					</div>
					<ul className="border-border bg-card divide-border mt-2 divide-y rounded-lg border">
						{projects.map((p) => (
							<li key={p.name} className="group">
								<div className="flex items-center gap-1 px-1.5 py-1">
									<button
										type="button"
										onClick={() => openProject(p.name)}
										className="hover:bg-accent flex min-w-0 flex-1 items-center gap-3 rounded px-2 py-1.5 text-left transition-colors"
									>
										<span className="text-primary text-sm leading-none">
											◈
										</span>
										<div className="min-w-0 flex-1">
											<div className="truncate text-sm font-medium">
												{p.name}
											</div>
											<div className="text-muted-foreground truncate font-mono text-[11px]">
												{baseName(p.binary_path)}
											</div>
										</div>
										<span className="text-muted-foreground shrink-0 text-[11px]">
											{fmtDate(p.updated_at)}
										</span>
										<ChevronRight className="text-muted-foreground h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
									</button>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
										onClick={() => deleteProject(p.name)}
										title={`Delete ${p.name}`}
									>
										<Trash2 className="h-3.5 w-3.5" />
									</Button>
								</div>
							</li>
						))}
					</ul>
				</div>
			)}

			{!loading && projects.length === 0 && (
				<div className="mt-12 flex flex-col items-center gap-2 text-center">
					<FolderOpen className="text-primary h-6 w-6" />
					<p className="text-muted-foreground text-xs">
						No projects yet. Create one to get started.
					</p>
				</div>
			)}
		</div>
	);
}
