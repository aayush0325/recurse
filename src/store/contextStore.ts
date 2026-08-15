import { create } from "zustand";

import type { ContextItem, PendingSelection } from "../types";

let nextId = 1;

interface ContextState {
	items: ContextItem[];
	pending: PendingSelection | null;
	add: (item: Omit<ContextItem, "id">) => void;
	remove: (id: string) => void;
	clear: () => void;
	setPending: (p: PendingSelection | null) => void;
	commitPending: () => void;
}

export const useContextStore = create<ContextState>((set, get) => ({
	items: [],
	pending: null,

	add: (item) =>
		set((s) => ({
			items: [...s.items, { ...item, id: `ctx-${nextId++}` }],
		})),

	remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

	clear: () => set({ items: [] }),

	setPending: (pending) => set({ pending }),

	commitPending: () => {
		const p = get().pending;
		if (!p) return;
		get().add({
			source: p.source,
			label: p.label,
			text: p.text,
		});
		set({ pending: null });
	},
}));
