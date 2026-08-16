import { Channel, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
	AgentEvent,
	AsmInsn,
	AsmResult,
	BinaryInfo,
	ChatMessage,
	DebugBreakpoint,
	DebugInsn,
	DecompileResult,
	Function,
	Import,
	LlmStatus,
	ModelInfo,
	Project,
	R2Graph,
	R2String,
	Registers,
	ShellInfo,
	Xref,
} from "./types";

export async function pickBinary(): Promise<string | null> {
	const path = await open({
		multiple: false,
		title: "Open binary",
	});
	return typeof path === "string" ? path : null;
}

export const api = {
	openBinary: (path: string) => invoke<BinaryInfo>("open_binary", { path }),
	analyze: () => invoke<void>("analyze"),
	closeBinary: () => invoke<void>("close_binary"),
	functions: () => invoke<Function[]>("functions"),
	functionAt: (addr: number) => invoke<Function>("function_at", { addr }),
	functionDisasm: (addr: number) =>
		invoke<AsmResult>("function_disasm", { addr }),
	functionGraph: (addr: number) =>
		invoke<R2Graph[]>("function_graph", { addr }),
	disassemble: (addr: number, count: number) =>
		invoke<AsmInsn[]>("disassemble", { addr, count }),
	strings: () => invoke<R2String[]>("strings"),
	imports: () => invoke<Import[]>("imports"),
	xrefsTo: (addr: number) => invoke<Xref[]>("xrefs_to", { addr }),
	decompile: (addr: number) => invoke<DecompileResult>("decompile", { addr }),
	raw: (cmd: string) => invoke<unknown>("raw", { cmd }),
	setZoom: (scale: number) => invoke<void>("set_zoom", { scale }),
	agentChat: (message: string, onEvent: Channel<AgentEvent>) =>
		invoke<void>("agent_chat", { message, onEvent }),
	agentReset: () => invoke<void>("agent_reset"),
	agentHistory: () => invoke<ChatMessage[]>("agent_history"),
	debugStart: () => invoke<void>("debug_start"),
	debugCommand: (cmd: string) => invoke<unknown>("debug_command", { cmd }),
	debugStop: () => invoke<void>("debug_stop"),
	debugRegisters: () => invoke<Registers>("debug_registers"),
	debugDisassemble: (count: number) =>
		invoke<DebugInsn[]>("debug_disassemble", { count }),
	debugBreakpoints: () => invoke<DebugBreakpoint[]>("debug_breakpoints"),
	llmStatus: () => invoke<LlmStatus>("llm_status"),
	setModel: (id: string) => invoke<void>("set_model", { id }),
	saveApiKey: (key: string) => invoke<void>("save_api_key", { key }),
	listModels: (refresh = false) =>
		invoke<ModelInfo[]>("list_models", { refresh }),
	listProjects: () => invoke<Project[]>("list_projects"),
	createProject: (name: string, binaryPath: string) =>
		invoke<Project>("create_project", { name, binaryPath }),
	openProject: (name: string) => invoke<Project>("open_project", { name }),
	deleteProject: (name: string) => invoke<void>("delete_project", { name }),
	projectReadFile: (name: string, path: string) =>
		invoke<string>("project_read_file", { name, path }),
	projectWriteFile: (name: string, path: string, content: string) =>
		invoke<void>("project_write_file", { name, path, content }),
	projectListFiles: (name: string) =>
		invoke<string[]>("project_list_files", { name }),
	shellSpawn: () => invoke<ShellInfo>("shell_spawn"),
	shellWrite: (id: number, data: string) =>
		invoke<void>("shell_write", { id, data }),
	shellResize: (id: number, rows: number, cols: number) =>
		invoke<void>("shell_resize", { id, rows, cols }),
	shellKill: (id: number) => invoke<void>("shell_kill", { id }),
};
