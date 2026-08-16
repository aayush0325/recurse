import { useState } from "react";
import { ArrowRight, Binary } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { pickBinary } from "@/api";
import { useProjectStore } from "@/store/projectStore";
import { useUiStore } from "@/store/uiStore";

function baseName(path: string): string {
	return path.split(/[\\/]/).pop() ?? "";
}

export function NewProjectDialog() {
	const open = useUiStore((s) => s.newProjectOpen);
	const setOpen = useUiStore((s) => s.setNewProjectOpen);
	const createProject = useProjectStore((s) => s.createProject);

	const [name, setName] = useState("");
	const [binaryPath, setBinaryPath] = useState("");
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const browse = async () => {
		const path = await pickBinary();
		if (path) {
			setBinaryPath(path);
			if (!name.trim()) setName(baseName(path).replace(/\.[^.]+$/, ""));
		}
	};

	const create = async () => {
		if (!name.trim() || !binaryPath.trim()) return;
		setCreating(true);
		setError(null);
		try {
			await createProject(name.trim(), binaryPath);
			setName("");
			setBinaryPath("");
			setOpen(false);
		} catch (e) {
			setError(String(e));
		} finally {
			setCreating(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-md gap-0 overflow-hidden p-0">
				<div className="border-border border-b px-6 py-5">
					<div className="flex items-center gap-2.5">
						<span className="text-primary text-xl leading-none">
							◈
						</span>
						<DialogTitle className="text-lg">
							New project
						</DialogTitle>
					</div>
					<p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
						A workspace for one target binary. Everything lives in{" "}
						<code className="text-primary font-mono">
							~/.recurse/&lt;name&gt;
						</code>
						.
					</p>
				</div>

				<div className="flex flex-col gap-5 px-6 py-6">
					<button
						type="button"
						onClick={browse}
						className={cn(
							"group flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors",
							binaryPath
								? "border-border bg-card hover:bg-accent"
								: "border-border hover:border-primary bg-card/50 hover:bg-accent border-dashed",
						)}
					>
						<Binary
							className="text-primary h-8 w-8 shrink-0"
							strokeWidth={1.5}
						/>
						<div className="min-w-0 flex-1">
							{binaryPath ? (
								<>
									<div className="text-foreground truncate font-mono text-sm">
										{baseName(binaryPath)}
									</div>
									<div className="text-muted-foreground truncate text-[11px]">
										{binaryPath}
									</div>
								</>
							) : (
								<>
									<div className="text-foreground text-sm font-medium">
										Select target binary
									</div>
									<div className="text-muted-foreground text-[11px]">
										ELF · PE · Mach-O · any executable
									</div>
								</>
							)}
						</div>
						<span className="text-muted-foreground group-hover:text-foreground text-[11px] transition-colors">
							{binaryPath ? "change" : "browse"}
						</span>
					</button>

					<div>
						<label className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
							Project name
						</label>
						<div className="border-border bg-card focus-within:border-primary mt-1.5 flex items-center overflow-hidden rounded-md border font-mono text-sm transition-colors">
							<span className="text-muted-foreground border-border bg-background border-r px-3 py-2 text-xs">
								~/.recurse/
							</span>
							<input
								className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent px-3 py-2 outline-none"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="my-analysis"
								autoFocus
							/>
						</div>
					</div>

					{error && (
						<div className="border-destructive bg-destructive/10 text-destructive rounded-md border p-2.5 text-[11px]">
							{error}
						</div>
					)}

					<Button
						size="lg"
						className="w-full"
						onClick={create}
						disabled={
							creating || !name.trim() || !binaryPath.trim()
						}
					>
						{creating ? "Creating…" : "Create & Open"}
						{!creating && <ArrowRight className="h-4 w-4" />}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
