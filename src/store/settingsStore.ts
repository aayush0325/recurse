import { create } from "zustand";

import { api } from "../api";

const KEY = "recurse.zoomLevel";
const MIN = -5;
const MAX = 8;

function scaleFor(level: number): number {
	return Math.pow(1.2, level);
}

interface SettingsState {
	zoomLevel: number;
	initZoom: () => Promise<void>;
	zoomIn: () => Promise<void>;
	zoomOut: () => Promise<void>;
	resetZoom: () => Promise<void>;
}

function readInitial(): number {
	const v = Number(localStorage.getItem(KEY));
	if (!Number.isFinite(v)) return 0;
	return Math.min(MAX, Math.max(MIN, Math.round(v)));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
	zoomLevel: readInitial(),

	initZoom: async () => {
		try {
			await api.setZoom(scaleFor(get().zoomLevel));
		} catch {
			/* non-fatal */
		}
	},

	zoomIn: async () => {
		const z = Math.min(MAX, get().zoomLevel + 1);
		set({ zoomLevel: z });
		localStorage.setItem(KEY, String(z));
		try {
			await api.setZoom(scaleFor(z));
		} catch {
			/* non-fatal */
		}
	},

	zoomOut: async () => {
		const z = Math.max(MIN, get().zoomLevel - 1);
		set({ zoomLevel: z });
		localStorage.setItem(KEY, String(z));
		try {
			await api.setZoom(scaleFor(z));
		} catch {
			/* non-fatal */
		}
	},

	resetZoom: async () => {
		localStorage.removeItem(KEY);
		set({ zoomLevel: 0 });
		try {
			await api.setZoom(1);
		} catch {
			/* non-fatal */
		}
	},
}));
