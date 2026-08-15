import { create } from "zustand";

import { api } from "../api";
import type {
	AsmResult,
	DecompileAnnotation,
	Function,
	Import,
	R2String,
} from "../types";
import { useUiStore } from "./uiStore";

interface AnalysisState {
	funcs: Function[];
	selected: Function | null;
	asm: AsmResult | null;
	asmLoading: boolean;
	strings: R2String[];
	imports: Import[];
	decompiled: string | null;
	decompiledAnnotations: DecompileAnnotation[];
	decompileError: string | null;
	decompiling: boolean;

	beginOpen: () => void;
	setAll: (data: {
		funcs: Function[];
		strings: R2String[];
		imports: Import[];
	}) => void;
	reset: () => void;
	selectFn: (fn: Function) => void;
	refreshDisasm: () => Promise<void>;
	decompile: () => Promise<void>;
	clearDecompiled: () => void;
}

const initial = {
	funcs: [] as Function[],
	selected: null as Function | null,
	asm: null as AsmResult | null,
	asmLoading: false,
	strings: [] as R2String[],
	imports: [] as Import[],
	decompiled: null as string | null,
	decompiledAnnotations: [] as DecompileAnnotation[],
	decompileError: null as string | null,
	decompiling: false,
};

const setErr = (e: string) => useUiStore.getState().setErr(e);

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
	...initial,

	beginOpen: () => set({ ...initial }),

	setAll: ({ funcs, strings, imports }) => set({ funcs, strings, imports }),

	reset: () => set({ ...initial, decompiling: false }),

	selectFn: (fn) => {
		// UI concern: switch to disassembly tab when a function is picked.
		useUiStore.getState().setTab("disasm");
		set({
			selected: fn,
			asm: null,
			asmLoading: true,
			decompiled: null,
			decompiledAnnotations: [],
			decompileError: null,
			decompiling: false,
		});
		const addr = fn.addr;
		api.functionDisasm(addr)
			.then((asm) => {
				if (get().selected?.addr === addr) set({ asm });
			})
			.catch((e) => {
				if (get().selected?.addr === addr) {
					set({ asm: null });
					setErr(String(e));
				}
			})
			.finally(() => {
				if (get().selected?.addr === addr) set({ asmLoading: false });
			});
	},

	refreshDisasm: async () => {
		const sel = get().selected;
		if (!sel) return;
		const addr = sel.addr;
		set({ asmLoading: true });
		try {
			const asm = await api.functionDisasm(addr);
			if (get().selected?.addr === addr) set({ asm });
		} catch (e) {
			if (get().selected?.addr === addr) setErr(String(e));
		} finally {
			if (get().selected?.addr === addr) set({ asmLoading: false });
		}
	},

	decompile: async () => {
		const sel = get().selected;
		if (!sel) return;
		const addr = sel.addr;
		set({
			decompiling: true,
			decompiled: null,
			decompiledAnnotations: [],
			decompileError: null,
		});
		try {
			const out = await api.decompile(addr);
			if (get().selected?.addr !== addr) return;
			const code =
				typeof out === "string"
					? out
					: out?.code ?? JSON.stringify(out, null, 2);
			const annotations =
				typeof out === "string" ? [] : (out.annotations ?? []);
			set({ decompiled: code, decompiledAnnotations: annotations });
		} catch (e) {
			if (get().selected?.addr !== addr) return;
			set({
				decompileError: `${e}\n\nThe decompiler plugin is not available on this install.`,
			});
		} finally {
			if (get().selected?.addr === addr) set({ decompiling: false });
		}
	},

	clearDecompiled: () =>
		set({
			decompiled: null,
			decompiledAnnotations: [],
			decompileError: null,
			decompiling: false,
		}),
}));
