import { create } from "zustand";

import { api } from "../api";
import type { Session } from "../types";
import { useAgentStore } from "./agentStore";
import { useLlmStore } from "./llmStore";
import { useProjectStore } from "./projectStore";

interface SessionState {
	sessions: Session[];
	current: Session | null;
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
	create: () => Promise<void>;
	select: (id: string) => Promise<void>;
	remove: (id: string) => Promise<void>;
	rename: (id: string, name: string) => Promise<void>;
	ensure: () => Promise<void>;
	reset: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
	sessions: [],
	current: null,
	loading: false,
	error: null,

	refresh: async () => {
		const project = useProjectStore.getState().current?.name;
		if (!project) {
			set({ sessions: [], current: null, loading: false });
			return;
		}
		set({ loading: true, error: null });
		try {
			const list = await api.sessionsList(project);
			set({ sessions: list, loading: false });
		} catch (e) {
			set({ loading: false, error: String(e) });
		}
	},

	create: async () => {
		try {
			const s = await api.sessionsCreate();
			await get().refresh();
			set({ current: s });
			useAgentStore.getState().reset();
			useAgentStore.setState({ activeSessionId: s.id });
		} catch (e) {
			console.error("sessions_create failed:", e);
		}
	},

	select: async (id: string) => {
		set({ loading: true, error: null });
		try {
			const s = await api.sessionsSelect(id);
			set({ current: s });
			useAgentStore.setState({
				activeSessionId: s.id,
				activeRunId: null,
			});
			if (s.model) useLlmStore.setState({ model: s.model });
			await useAgentStore.getState().reload();
			await get().refresh();
		} catch (e) {
			set({ loading: false, error: String(e) });
			console.error("sessions_select failed:", e);
		}
	},

	remove: async (id: string) => {
		const project = useProjectStore.getState().current?.name;
		if (!project) return;
		try {
			await api.sessionsDelete(project, id);
			const wasCurrent = get().current?.id === id;
			await get().refresh();
			if (wasCurrent) {
				const { sessions } = get();
				if (sessions.length > 0) {
					await get().select(sessions[0].id);
				} else {
					await get().create();
				}
			}
		} catch (e) {
			console.error("sessions_delete failed:", e);
		}
	},

	rename: async (id: string, name: string) => {
		const project = useProjectStore.getState().current?.name;
		if (!project) return;
		try {
			await api.sessionsRename(project, id, name);
			await get().refresh();
			if (get().current?.id === id) {
				set((s) => ({
					current: s.current ? { ...s.current, name } : null,
				}));
			}
		} catch (e) {
			console.error("sessions_rename failed:", e);
		}
	},

	ensure: async () => {
		const project = useProjectStore.getState().current?.name;
		if (!project) return;
		try {
			const list = await api.sessionsList(project);
			set({ sessions: list });
			if (list.length > 0) {
				await get().select(list[0].id);
			} else {
				await get().create();
			}
		} catch (e) {
			set({
				sessions: [],
				current: null,
				loading: false,
				error: String(e),
			});
		}
	},

	reset: () =>
		set({ sessions: [], current: null, loading: false, error: null }),
}));
