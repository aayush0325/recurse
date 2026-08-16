import { useEffect, useState } from "react";
import {
	Background,
	Controls,
	Handle,
	MarkerType,
	Position,
	ReactFlow,
	ReactFlowProvider,
	type Edge,
	type Node,
	type NodeProps,
	useEdgesState,
	useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";

import { api } from "@/api";
import { cn } from "@/lib/utils";
import { callTarget } from "@/lib/calls";
import { useAnalysisStore } from "@/store/analysisStore";
import type { Function, GraphOp, R2Graph } from "@/types";

const BLOCK_W = 380;
const LINE_H = 17;
const HEADER_H = 24;

function fmtAddr(a?: number | null) {
	return typeof a === "number" ? `0x${a.toString(16)}` : "";
}

type BlockOp = GraphOp & { target?: Function | null };
type BlockData = { addr: string; ops: BlockOp[] };
type BlockNode = Node<BlockData, "cfgnode">;

function BlockNodeComponent({ data }: NodeProps<BlockNode>) {
	return (
		<div className="border-border bg-card rounded border font-mono text-[10.5px] shadow-lg">
			<Handle
				type="target"
				position={Position.Top}
				className="!opacity-0"
			/>
			<div className="text-muted-foreground border-border bg-secondary/30 flex items-center gap-2 border-b px-1.5 text-[9px]">
				<span className="text-primary font-semibold">{data.addr}</span>
				<span className="ml-auto">{data.ops.length} insn</span>
			</div>
			<div className="py-0.5">
				{data.ops.map((op, i) => {
					const clickable = !!op.target;
					return (
						<div
							key={i}
							className={cn(
								"flex gap-1.5 px-1.5 leading-[17px] whitespace-nowrap",
								clickable &&
									"hover:bg-accent/70 cursor-pointer",
							)}
							onClick={
								clickable && op.target
									? () =>
											useAnalysisStore
												.getState()
												.selectFn(op.target as Function)
									: undefined
							}
							title={
								clickable && op.target
									? `Go to ${op.target.name ?? fmtAddr(op.target.addr)}`
									: undefined
							}
						>
							<span className="text-primary w-[60px] shrink-0">
								{fmtAddr(op.addr)}
							</span>
							<span className="text-muted-foreground w-[90px] shrink-0 truncate">
								{op.bytes ?? ""}
							</span>
							<span
								className={cn(
									"text-foreground truncate",
									clickable &&
										"text-primary underline decoration-dotted underline-offset-2",
								)}
							>
								{op.disasm ?? ""}
							</span>
						</div>
					);
				})}
			</div>
			<Handle
				type="source"
				position={Position.Bottom}
				className="!opacity-0"
			/>
		</div>
	);
}

const nodeTypes = { cfgnode: BlockNodeComponent };

function makeEdge(src: string, dst: number, label: string | undefined): Edge {
	const conditional = label !== undefined;
	const taken = label === "T";
	const color = conditional ? (taken ? "#22c55e" : "#ef4444") : "#8b8b8b";
	return {
		id: `${src}->${dst}`,
		source: src,
		target: String(dst),
		type: "smoothstep",
		label,
		style: { stroke: color, strokeWidth: conditional ? 1.6 : 1.2 },
		labelStyle: conditional
			? { fill: color, fontSize: 11, fontWeight: 700 }
			: undefined,
		markerEnd: { type: MarkerType.ArrowClosed, color },
	};
}

function toGraph(
	graph: R2Graph,
	byAddr: Map<number, Function>,
): { nodes: BlockNode[]; edges: Edge[] } {
	const blocks = graph.blocks ?? [];
	const nodes: BlockNode[] = blocks.map((b) => {
		const ops: BlockOp[] = (b.ops ?? []).map((op) => ({
			...op,
			target: callTarget(op, byAddr),
		}));
		return {
			id: String(b.addr),
			type: "cfgnode",
			data: { addr: fmtAddr(b.addr), ops },
			position: { x: 0, y: 0 },
			width: BLOCK_W,
			height: HEADER_H + ops.length * LINE_H + 6,
		};
	});

	const edges: Edge[] = [];
	for (const b of blocks) {
		const src = String(b.addr);
		const conditional = b.jump != null && b.fail != null;
		if (b.jump != null) {
			edges.push(makeEdge(src, b.jump, conditional ? "T" : undefined));
		}
		if (b.fail != null) {
			edges.push(makeEdge(src, b.fail, conditional ? "F" : undefined));
		}
	}
	return { nodes, edges };
}

function layout(nodes: BlockNode[], edges: Edge[]): BlockNode[] {
	const g = new dagre.graphlib.Graph();
	g.setDefaultEdgeLabel(() => ({}));
	g.setGraph({
		rankdir: "TB",
		nodesep: 22,
		ranksep: 56,
		marginx: 16,
		marginy: 16,
	});
	nodes.forEach((n) =>
		g.setNode(n.id, { width: n.width ?? BLOCK_W, height: n.height ?? 80 }),
	);
	edges.forEach((e) => g.setEdge(e.source, e.target));
	dagre.layout(g);
	return nodes.map((n) => {
		const pos = g.node(n.id);
		const w = n.width ?? BLOCK_W;
		const h = n.height ?? 80;
		return { ...n, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
	});
}

function GraphCanvas({ addr }: { addr: number }) {
	const [nodes, setNodes, onNodesChange] = useNodesState<BlockNode>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
	const [loading, setLoading] = useState(true);
	const [err, setErr] = useState<string | null>(null);
	const funcs = useAnalysisStore((s) => s.funcs);

	useEffect(() => {
		let cancelled = false;
		const byAddr = new Map<number, Function>();
		for (const f of funcs) {
			if (typeof f.addr === "number") byAddr.set(f.addr, f);
		}
		api.functionGraph(addr)
			.then((arr) => {
				if (cancelled) return;
				const g = arr?.[0];
				if (!g) {
					setErr("no graph for this address");
					setLoading(false);
					return;
				}
				const { nodes: ns, edges: es } = toGraph(g, byAddr);
				setNodes(layout(ns, es));
				setEdges(es);
				setLoading(false);
			})
			.catch((e) => {
				if (!cancelled) {
					setErr(String(e));
					setLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [addr, setNodes, setEdges, funcs]);

	return (
		<div className="h-full w-full">
			{loading ? (
				<div className="text-muted-foreground flex h-full items-center justify-center text-xs">
					building graph…
				</div>
			) : err ? (
				<div className="border-destructive bg-destructive/10 text-destructive m-3 rounded-md border p-2.5 text-[11px]">
					{err}
				</div>
			) : nodes.length === 0 ? (
				<div className="text-muted-foreground flex h-full items-center justify-center text-xs">
					No graph.
				</div>
			) : (
				<ReactFlow
					key={addr}
					nodes={nodes}
					edges={edges}
					nodeTypes={nodeTypes}
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
					fitView
					fitViewOptions={{ padding: 0.15 }}
					nodesDraggable={false}
					nodesConnectable={false}
					elementsSelectable
					panOnScroll
					zoomOnScroll={false}
					zoomOnPinch
					zoomOnDoubleClick={false}
					minZoom={0.05}
					proOptions={{ hideAttribution: true }}
					className="bg-background"
				>
					<Background gap={18} size={1} />
					<Controls showInteractive={false} />
				</ReactFlow>
			)}
		</div>
	);
}

export function GraphPanel({ addr }: { addr: number }) {
	// Keying by address remounts the canvas per function so state (loading,
	// nodes) resets cleanly and fitView re-runs.
	return (
		<div className="min-h-0 min-w-0 flex-1">
			<ReactFlowProvider>
				<GraphCanvas key={addr} addr={addr} />
			</ReactFlowProvider>
		</div>
	);
}
