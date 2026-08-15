import { create } from "zustand";

import { api } from "../api";
import type { AsmResult, Function, Import, R2String } from "../types";
import { useUiStore } from "./uiStore";

interface AnalysisState {
	funcs: Function[];
	selected: Function | null;
	asm: AsmResult | null;
	asmLoading: boolean;
	strings: R2String[];
	imports: Import[];
	decompiled: string | null;
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
}

const initial = {
	funcs: [] as Function[],
	selected: null as Function | null,
	asm: null as AsmResult | null,
	asmLoading: false,
	strings: [] as R2String[],
	imports: [] as Import[],
	decompiled: null as string | null,
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
			asmLoading: true,
			decompiled: null,
			decompileError: null,
		});
		api.functionDisasm(fn.addr)
			.then((asm) => set({ asm }))
			.catch((e) => {
				set({ asm: null });
				setErr(String(e));
			})
			.finally(() => set({ asmLoading: false }));
	},

	refreshDisasm: async () => {
		const sel = get().selected;
		if (!sel) return;
		set({ asmLoading: true });
		try {
			set({ asm: await api.functionDisasm(sel.addr) });
		} catch (e) {
			setErr(String(e));
		} finally {
			set({ asmLoading: false });
		}
	},

	decompile: async () => {
		const sel = get().selected;
		if (!sel) return;
		set({ decompiling: true, decompiled: null, decompileError: null });
		try {
			const out = await api.decompile(sel.addr);
			set({
				decompiled:
					typeof out === "string"
						? out
						: JSON.stringify(out, null, 2),
			});
		} catch (e) {
			set({
				decompileError: `${e}\n\nThe decompiler plugin is not available on this install.`,
			});
		} finally {
			set({ decompiling: false });
		}
	},
}));
