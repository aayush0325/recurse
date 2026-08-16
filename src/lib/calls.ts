import type { Function } from "@/types";

/**
 * Minimal shape we need to detect a direct call to a function. r2 normalizes
 * call instructions to `type: "call"` across all architectures (x86 `call`,
 * ARM `bl`, RISC-V `jal`, …); for direct calls the resolved target is carried
 * in `jump`.
 */
export interface CallOp {
	type?: unknown;
	disasm?: unknown;
	text?: unknown;
	jump?: unknown;
}

export function isCallOp(op: CallOp): boolean {
	const t = String(op.type ?? "").toLowerCase();
	if (t === "call" || t === "ucall" || t === "ccall") return true;
	const d = String(op.disasm ?? op.text ?? "")
		.trim()
		.toLowerCase();
	return d.startsWith("call ");
}

/** The function this op calls, or null if it isn't a resolvable direct call. */
export function callTarget(
	op: CallOp,
	byAddr: Map<number, Function>,
): Function | null {
	if (!isCallOp(op)) return null;
	const jump = op.jump;
	if (typeof jump !== "number") return null;
	return byAddr.get(jump) ?? null;
}
