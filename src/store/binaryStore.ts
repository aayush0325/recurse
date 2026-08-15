import { create } from "zustand";

import { api } from "../api";
import type { BinaryInfo } from "../types";
import { useAnalysisStore } from "./analysisStore";
import { useUiStore } from "./uiStore";

interface BinaryState {
	binary: BinaryInfo | null;
	busy: boolean;
	openBinary: (path: string) => Promise<void>;
	closeBinary: () => Promise<void>;
}

export const useBinaryStore = create<BinaryState>((set) => ({
	binary: null,
	busy: false,
	openBinary: async (path) => {
		set({ busy: true });
		useUiStore.getState().setErr(null);
		useAnalysisStore.getState().beginOpen();
		try {
			const info = await api.openBinary(path);
			set({ binary: info });
			await api.analyze();
			const [f, s, i] = await Promise.all([
				api.functions(),
				api.strings(),
				api.imports(),
			]);
			useAnalysisStore.getState().setAll({
				funcs: f ?? [],
				strings: s ?? [],
				imports: i ?? [],
			});
		} catch (e) {
			useUiStore.getState().setErr(`failed to open binary: ${e}`);
			set({ binary: null });
		} finally {
			set({ busy: false });
		}
	},
	closeBinary: async () => {
		try {
			await api.closeBinary();
		} catch {
			/* ignore close errors */
		}
		useAnalysisStore.getState().reset();
		set({ binary: null });
	},
}));
