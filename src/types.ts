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

export type CenterTab = "disasm" | "strings" | "imports";

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
