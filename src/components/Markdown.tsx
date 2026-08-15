import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

type CodeProps = ComponentProps<"code"> & { node?: unknown };

function Code({ node: _node, className, children, ...props }: CodeProps) {
	const text = String(children ?? "");
	const isBlock =
		/^language-/.test(className ?? "") || text.includes("\n");
	if (isBlock) {
		return (
			<code className={cn("font-mono text-[11px]", className)} {...props}>
				{children}
			</code>
		);
	}
	return (
		<code
			className="bg-muted font-mono text-[11px] rounded px-1 py-0.5"
			{...props}
		>
			{children}
		</code>
	);
}

const components = {
	p: (p: ComponentProps<"p">) => (
		<p className="mb-2 leading-relaxed last:mb-0" {...p} />
	),
	ul: (p: ComponentProps<"ul">) => (
		<ul className="mb-2 list-disc pl-4 last:mb-0" {...p} />
	),
	ol: (p: ComponentProps<"ol">) => (
		<ol className="mb-2 list-decimal pl-4 last:mb-0" {...p} />
	),
	li: (p: ComponentProps<"li">) => <li className="mb-0.5" {...p} />,
	h1: (p: ComponentProps<"h1">) => (
		<h1 className="mb-1.5 text-sm font-semibold" {...p} />
	),
	h2: (p: ComponentProps<"h2">) => (
		<h2 className="mb-1.5 text-sm font-semibold" {...p} />
	),
	h3: (p: ComponentProps<"h3">) => (
		<h3 className="mb-1 text-[13px] font-semibold" {...p} />
	),
	h4: (p: ComponentProps<"h4">) => (
		<h4 className="mb-1 text-xs font-semibold" {...p} />
	),
	h5: (p: ComponentProps<"h5">) => (
		<h5 className="mb-1 text-xs font-semibold" {...p} />
	),
	h6: (p: ComponentProps<"h6">) => (
		<h6 className="mb-1 text-xs font-semibold" {...p} />
	),
	blockquote: (p: ComponentProps<"blockquote">) => (
		<blockquote
			className="border-muted text-muted-foreground mb-2 border-l-2 pl-2 last:mb-0"
			{...p}
		/>
	),
	pre: (p: ComponentProps<"pre">) => (
		<pre
			className="bg-muted/60 mb-2 overflow-x-auto rounded p-2 font-mono text-[11px] leading-relaxed whitespace-pre last:mb-0"
			{...p}
		/>
	),
	code: Code,
	a: (p: ComponentProps<"a">) => (
		<a className="text-primary underline" target="_blank" rel="noreferrer" {...p} />
	),
	hr: () => <hr className="border-border my-2" />,
	table: (p: ComponentProps<"table">) => (
		<div className="mb-2 overflow-x-auto last:mb-0">
			<table className="border-border text-[11px]" {...p} />
		</div>
	),
	th: (p: ComponentProps<"th">) => (
		<th className="border-border border px-2 py-0.5 font-semibold" {...p} />
	),
	td: (p: ComponentProps<"td">) => (
		<td className="border-border border px-2 py-0.5" {...p} />
	),
};

export function Markdown({ children }: { children: string }) {
	return (
		<div className="min-w-0 break-words">
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
				{children}
			</ReactMarkdown>
		</div>
	);
}
