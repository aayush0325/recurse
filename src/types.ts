export interface BinaryInfo {
	path: string;
	info: {
		bin?: {
			arch?: string;
			bits?: number;
			type?: string | null;
			[k: string]: unknown;
		};
		[k: string]: unknown;
	};
	function_count: number;
	string_count: number;
}

export interface Function {
	addr: number;
	name?: string;
	realname?: string;
	size?: number;
	signature?: string;
	[k: string]: unknown;
}

export interface AsmInsn {
	addr: number;
	text?: string;
	disasm?: string;
	bytes?: string | null;
	esil?: string | null;
	jump?: number | null;
	ptr?: number | null;
	[k: string]: unknown;
}

export interface AsmResult {
	name?: string;
	addr?: number;
	size?: number;
	ops?: AsmInsn[];
	[k: string]: unknown;
}

export interface R2String {
	vaddr: number;
	string: string;
	type?: string;
	[k: string]: unknown;
}

export interface Import {
	name?: string;
	[k: string]: unknown;
}

export interface Xref {
	from: number;
	type?: string;
	fcn_name?: string;
	opcode?: string;
	[k: string]: unknown;
}

export interface DecompileAnnotation {
	start: number;
	end: number;
	type?: string;
	name?: string;
	offset?: number;
	syntax_highlight?: string;
	[k: string]: unknown;
}

export interface DecompileResult {
	code?: string;
	annotations?: DecompileAnnotation[];
	[k: string]: unknown;
}

export type CenterTab = "disasm" | "strings" | "imports" | "debug" | "shell";

export interface ModelInfo {
	id: string;
	name: string;
	context_length: number;
	prompt_price: string;
	free: boolean;
}

export interface LlmStatus {
	provider: string;
	configured: boolean;
	model: string;
}

export interface Project {
	name: string;
	binary_path: string;
	created_at: number;
	updated_at: number;
}

export interface ShellInfo {
	id: number;
	name: string;
}

export interface ToolCallFn {
	name: string;
	arguments: string;
}

export interface ToolCall {
	id: string;
	type: string;
	function: ToolCallFn;
}

export interface ChatMessage {
	role: string;
	content: string | null;
	tool_calls?: ToolCall[] | null;
	tool_call_id?: string | null;
	reasoning?: string | null;
}

export type AgentEventKind =
	| "reasoning"
	| "token"
	| "tool_call"
	| "tool_result"
	| "done"
	| "error";

export interface AgentEvent {
	kind: AgentEventKind;
	run_id: string;
	delta?: string;
	content?: string;
	message?: string;
	id?: string;
	name?: string;
	arguments?: string;
	result?: string;
}

export interface ContextItem {
	id: string;
	source: "disasm" | "decompile" | "string" | "function" | "debug";
	label: string;
	text: string;
}

export interface PendingSelection {
	label: string;
	text: string;
	source: ContextItem["source"];
}

export interface Registers {
	[key: string]: number;
}

export interface DebugInsn {
	addr: number;
	text?: string;
	disasm?: string;
	bytes?: string | null;
	[k: string]: unknown;
}

export interface DebugBreakpoint {
	addr: number;
	enabled?: boolean;
	[k: string]: unknown;
}

export interface GraphOp {
	addr: number;
	disasm?: string;
	bytes?: string | null;
	type?: string;
	[k: string]: unknown;
}

export interface GraphBlock {
	addr: number;
	size?: number;
	jump?: number | null;
	fail?: number | null;
	ops?: GraphOp[];
	[k: string]: unknown;
}

export interface R2Graph {
	name?: string;
	addr?: number;
	size?: number;
	blocks?: GraphBlock[];
	[k: string]: unknown;
}
