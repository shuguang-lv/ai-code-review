import type { ReviewComment } from "../types.js";

export const renderJson = (comments: ReviewComment[]): string => {
	return JSON.stringify(comments, null, 2);
};

export const renderMarkdown = (
	comments: ReviewComment[],
	ctx: {
		diffSummary: { added: number; deleted: number; filesChanged: number };
		codeGraph?: any;
		ragContext?: any;
	},
): string => {
	const header = `# AI Code Review\n\n- **files changed**: ${ctx.diffSummary.filesChanged}\n- **lines added**: ${ctx.diffSummary.added}\n- **lines deleted**: ${ctx.diffSummary.deleted}`;
	const cg = ctx.codeGraph
		? `\n\n## Code Graph Hotspots\n\n${JSON.stringify(ctx.codeGraph, null, 2)}`
		: "";
	const rag = ctx.ragContext
		? `\n\n## RAG Context\n\n${JSON.stringify(ctx.ragContext, null, 2)}`
		: "";
	const body =
		comments.length === 0
			? "\n\n_No issues detected._"
			: "\n\n## Review Comments\n\n" +
				comments
					.map(
						(c) => `- **${c.severity.toUpperCase()}** in \

													\`${c.file}:${c.line}\` — ${escapeMd(c.smell)}\n\n  - rationale: ${escapeMd(c.rationale)}\n  - suggestion: ${escapeMd(c.suggestion)}`,
					)
					.join("\n\n");
	return header + cg + rag + body + "\n";
};

const escapeMd = (s: string) => s.replace(/[|*_`]/g, (m) => `\\${m}`);
