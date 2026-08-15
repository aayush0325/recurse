import { create } from "zustand";

import { api } from "../api";
import type { Project } from "../types";
import { useBinaryStore } from "./binaryStore";

interface ProjectState {
	projects: Project[];
	current: Project | null;
	loading: boolean;
	error: string | null;

	loadProjects: () => Promise<void>;
	createProject: (name: string, binaryPath: string) => Promise<void>;
	openProject: (name: string) => Promise<void>;
	deleteProject: (name: string) => Promise<void>;
	close: () => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
	projects: [],
	current: null,
	loading: false,
	error: null,

	loadProjects: async () => {
		set({ loading: true, error: null });
		try {
			set({ projects: await api.listProjects() });
		} catch (e) {
			set({ error: String(e) });
		} finally {
			set({ loading: false });
		}
	},

	createProject: async (name, binaryPath) => {
		const p = await api.createProject(name, binaryPath);
		set({ current: p });
		await useBinaryStore.getState().openBinary(p.binary_path);
		await get().loadProjects();
	},

	openProject: async (name) => {
		const p = await api.openProject(name);
		set({ current: p });
		await useBinaryStore.getState().openBinary(p.binary_path);
	},

	deleteProject: async (name) => {
		await api.deleteProject(name);
		if (get().current?.name === name) set({ current: null });
		await get().loadProjects();
	},

	close: async () => {
		await useBinaryStore.getState().closeBinary();
		set({ current: null });
		await get().loadProjects();
	},
}));
