import { create } from "zustand";

import { api } from "../api";
import type { ModelInfo } from "../types";

interface LlmState {
	provider: string;
	model: string;
	configured: boolean;
	models: ModelInfo[];
	modelsLoading: boolean;
	modelsError: string | null;
	modelsOpen: boolean;

	init: () => Promise<void>;
	refresh: () => Promise<void>;
	selectModel: (id: string) => Promise<void>;
	saveApiKey: (key: string) => Promise<void>;
	keySaved: boolean;
	keyError: string | null;
	setModelsOpen: (b: boolean) => void;
	toggleModels: () => void;
}

export const useLlmStore = create<LlmState>((set, get) => ({
	provider: "openrouter",
	model: "",
	configured: false,
	models: [],
	modelsLoading: false,
	modelsError: null,
	modelsOpen: false,
	keySaved: false,
	keyError: null,

	init: async () => {
		try {
			const st = await api.llmStatus();
			set({
				provider: st.provider,
				configured: st.configured,
				model: st.model,
			});
		} catch {
			/* keep defaults */
		}
		get().refresh();
	},

	refresh: async () => {
		set({ modelsLoading: true, modelsError: null });
		try {
			const m = await api.listModels();
			set({ models: m });
		} catch (e) {
			set({ modelsError: String(e) });
		} finally {
			set({ modelsLoading: false });
		}
	},

	selectModel: async (id) => {
		try {
			await api.setModel(id);
			set({ model: id, modelsOpen: false });
		} catch (e) {
			set({ modelsError: String(e) });
		}
	},

	saveApiKey: async (key) => {
		set({ keyError: null, keySaved: false });
		try {
			await api.saveApiKey(key);
			const st = await api.llmStatus();
			set({ configured: st.configured, model: st.model, keySaved: true });
		} catch (e) {
			set({ keyError: String(e) });
		}
	},

	setModelsOpen: (modelsOpen) => set({ modelsOpen }),
	toggleModels: () => set((s) => ({ modelsOpen: !s.modelsOpen })),
}));
