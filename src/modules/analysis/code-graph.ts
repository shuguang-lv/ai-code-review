import { readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import oxc from "oxc-parser";
import { walk } from "oxc-walker";
import type { ParsedDiff } from "../types.js";

export type SymbolDef = {
	filePath: string;
	name: string;
	kind: "interface" | "type" | "class" | "function" | "enum" | "variable";
	exported: boolean;
	text: string;
	pos: { line: number; character: number };
};

export type FileMeta = {
	imports: Array<{ source: string; names: string[] }>;
	exports: Array<{ name: string; kind: SymbolDef["kind"] }>;
};

export type CodeGraph = {
	nodes: string[]; // relative file paths
	edges: Array<{ from: string; to: string; module: string }>;
};

export const buildCodeGraph = async (parsed: ParsedDiff, repoDir: string) => {
	const files = await discoverSourceFiles(repoDir);
	const nodes = new Set<string>();
	const edges: CodeGraph["edges"] = [];
	const definitions: Record<string, SymbolDef[]> = {};
	const fileMeta: Record<string, FileMeta> = {};

	const fileAbsToRel = (abs: string) =>
		path.relative(repoDir, abs).split(path.sep).join("/");

	const concurrency = Math.min(Math.max(2, os.cpus()?.length || 2), 12);
	let index = 0;
	await Promise.all(
		Array.from({ length: concurrency }).map(async () => {
			for (;;) {
				const i = index++;
				if (i >= files.length) break;
				const abs = files[i];
				const rel = fileAbsToRel(abs);
				nodes.add(rel);
				let code = "";
				try {
					code = await readFile(abs, "utf8");
				} catch {
					continue;
				}
				let result: unknown;
				try {
					result = oxc.parseSync(abs, code);
				} catch {
					continue;
				}

				const defs: SymbolDef[] = [];
				const meta: FileMeta = { imports: [], exports: [] };

				// Use walker over ESTree-compatible AST
				const program = (result as { program: unknown }).program;
				walk(program as Parameters<typeof walk>[0], {
					enter: (node) => {
						if (node.type === "ImportDeclaration" && node.source?.value) {
							const spec = String(node.source.value);
							pendingResolutions.push({ fromAbs: abs, fromRel: rel, spec });
							const names: string[] = [];
							for (const s of node.specifiers ?? []) {
								if (
									s.type === "ImportSpecifier" &&
									s.imported &&
									"name" in s.imported
								) {
									names.push((s.imported as { name: string }).name);
								} else if (
									s.type === "ImportDefaultSpecifier" &&
									s.local?.name
								) {
									names.push(`default as ${s.local.name}`);
								} else if (
									s.type === "ImportNamespaceSpecifier" &&
									s.local?.name
								) {
									names.push(`* as ${s.local.name}`);
								}
							}
							meta.imports.push({ source: spec, names });
						}
						if (node.type === "ExportNamedDeclaration") {
							const decl = node.declaration ?? null;
							if (decl) {
								const before = defs.length;
								collectDef(defs, rel, code, decl, true);
								for (let j = before; j < defs.length; j++)
									meta.exports.push({ name: defs[j].name, kind: defs[j].kind });
							}
							if (node.specifiers?.length) {
								for (const s of node.specifiers) {
									if (s.exported && "name" in s.exported) {
										const exp = defFromSpecifier(
											rel,
											code,
											(s.exported as { name: string }).name,
											true,
										);
										defs.push(exp);
										meta.exports.push({ name: exp.name, kind: exp.kind });
									}
								}
							}
						} else if (node.type === "ExportDefaultDeclaration") {
							const decl = node.declaration ?? null;
							if (decl) {
								const before = defs.length;
								collectDef(defs, rel, code, decl, true);
								for (let j = before; j < defs.length; j++)
									meta.exports.push({ name: defs[j].name, kind: defs[j].kind });
							}
						} else if (
							node.type === "VariableDeclaration" ||
							node.type === "FunctionDeclaration" ||
							node.type === "ClassDeclaration" ||
							node.type === "TSEnumDeclaration" ||
							node.type === "TSInterfaceDeclaration" ||
							node.type === "TSTypeAliasDeclaration"
						) {
							const before = defs.length;
							collectDef(defs, rel, code, node, false);
							for (let j = before; j < defs.length; j++) {
								// locals kept in defs only
							}
						}
					},
				});

				definitions[rel] = defs;
				fileMeta[rel] = meta;
			}
		}),
	);

	// resolve imports after traversal
	for (const item of pendingResolutions) {
		const resolvedAbs = await resolveModule(item.fromAbs, item.spec);
		if (resolvedAbs) {
			const toRel = fileAbsToRel(resolvedAbs);
			if (!toRel.startsWith("..")) {
				nodes.add(toRel);
				edges.push({ from: item.fromRel, to: toRel, module: item.spec });
			}
		}
	}

	const graph: CodeGraph = { nodes: Array.from(nodes), edges };

	const degree: Record<string, number> = {};
	for (const n of graph.nodes) degree[n] = 0;
	for (const e of graph.edges) {
		degree[e.from] = (degree[e.from] ?? 0) + 1;
		degree[e.to] = (degree[e.to] ?? 0) + 1;
	}
	const hotspots = Object.entries(degree)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([file, deg]) => ({ file, degree: deg }));

	const changedRel = new Set(parsed.files.map((f) => f.path));
	const relevantDefinitions: Record<string, SymbolDef[]> = {};
	for (const file of graph.nodes) {
		if (!changedRel.has(file)) continue;
		const importNeighbors = new Set<string>(
			graph.edges.filter((e) => e.from === file).map((e) => e.to),
		);
		const exportNeighbors = new Set<string>(
			graph.edges.filter((e) => e.to === file).map((e) => e.from),
		);
		const neighbors = new Set<string>([...importNeighbors, ...exportNeighbors]);
		const defs = [
			...(definitions[file] ?? []),
			...Array.from(neighbors).flatMap((n) =>
				(definitions[n] ?? []).filter((d) => d.exported),
			),
		];
		relevantDefinitions[file] = limitDefs(defs, 8000);
	}

	return {
		graph,
		definitions,
		relevantDefinitions,
		summary: { hotspots },
		fileMeta,
	};
};

export const summarizeDefinitions = (
	defs: SymbolDef[],
	maxItems = 20,
	includeText = false,
) => {
	return defs.slice(0, maxItems).map((d) => ({
		name: d.name,
		kind: d.kind,
		pos: d.pos,
		...(includeText ? { text: d.text.slice(0, 160) } : {}),
	}));
};

const collectDef = (
	defs: SymbolDef[],
	rel: string,
	code: string,
	node: unknown,
	exported: boolean,
) => {
	const kind = toKind(node as { type: string });
	const name = toName(
		node as {
			id?: { name?: string };
			declarations?: Array<{ id?: { name?: string } }>;
			name?: string;
		},
	);
	if (!name) return;

	// Type assertion for AST node properties
	const astNode = node as {
		loc?: { start?: { line: number; column: number } };
		start?: number;
		end?: number;
	};
	const { line, column } = astNode.loc?.start ?? { line: 1, column: 0 };
	let text = code.slice(astNode.start ?? 0, astNode.end ?? 0);
	if (text.length > 2000)
		text = `${text.slice(0, 2000)}\n/* ...truncated... */`;
	defs.push({
		filePath: rel,
		name,
		kind,
		exported,
		text,
		pos: { line, character: column + 1 },
	});
};

const defFromSpecifier = (
	rel: string,
	code: string,
	name: string,
	exported: boolean,
): SymbolDef => ({
	filePath: rel,
	name,
	kind: "variable",
	exported,
	text: code.slice(0, 0),
	pos: { line: 1, character: 1 },
});

const toKind = (node: { type: string }): SymbolDef["kind"] => {
	switch (node.type) {
		case "TSInterfaceDeclaration":
			return "interface";
		case "TSTypeAliasDeclaration":
			return "type";
		case "ClassDeclaration":
			return "class";
		case "FunctionDeclaration":
			return "function";
		case "TSEnumDeclaration":
			return "enum";
		default:
			return "variable";
	}
};

const toName = (node: {
	id?: { name?: string };
	declarations?: Array<{ id?: { name?: string } }>;
	name?: string;
}): string | null => {
	if (node.id?.name) return node.id.name;
	if (node.declarations?.length && node.declarations[0]?.id?.name)
		return node.declarations[0].id.name;
	if (node.name) return node.name;
	return null;
};

const limitDefs = (defs: SymbolDef[], charBudget: number) => {
	const out: SymbolDef[] = [];
	let used = 0;
	for (const d of defs) {
		const cost = d.text.length + d.name.length + 50;
		if (used + cost > charBudget) break;
		out.push(d);
		used += cost;
	}
	return out;
};

const discoverSourceFiles = async (root: string) => {
	const results: string[] = [];
	await walkDir(root, results);
	return results;
};

const walkDir = async (dir: string, out: string[]) => {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const e of entries) {
		if (e.name.startsWith(".")) continue;
		if (
			[
				"node_modules",
				"dist",
				"build",
				"out",
				".git",
				"coverage",
				"__snapshots__",
				"vendor",
			].includes(e.name)
		)
			continue;
		const full = path.join(dir, e.name);
		if (e.isDirectory()) {
			await walkDir(full, out);
		} else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) {
			out.push(full);
		}
	}
};

export const getRelevantDefinitionsForFiles = (
	files: string[],
	graph: CodeGraph,
	definitions: Record<string, SymbolDef[]>,
	charBudget = 8000,
) => {
	const rel: Record<string, SymbolDef[]> = {};
	for (const file of files) {
		const importNeighbors = new Set<string>(
			graph.edges.filter((e) => e.from === file).map((e) => e.to),
		);
		const exportNeighbors = new Set<string>(
			graph.edges.filter((e) => e.to === file).map((e) => e.from),
		);
		const neighbors = new Set<string>([...importNeighbors, ...exportNeighbors]);
		const defs = [
			...(definitions[file] ?? []),
			...Array.from(neighbors).flatMap((n) =>
				(definitions[n] ?? []).filter((d) => d.exported),
			),
		];
		rel[file] = limitDefs(defs, charBudget);
	}
	return rel;
};

const fileExistsCache = new Map<string, boolean>();
const fileExists = async (p: string) => {
	if (fileExistsCache.has(p)) return fileExistsCache.get(p);
	try {
		await stat(p);
		fileExistsCache.set(p, true);
		return true;
	} catch {
		fileExistsCache.set(p, false);
		return false;
	}
};

const pendingResolutions: Array<{
	fromAbs: string;
	fromRel: string;
	spec: string;
}> = [];

const resolveModule = async (fromAbs: string, spec: string) => {
	if (!spec.startsWith(".") && !spec.startsWith("/")) return null; // external
	const base = path.resolve(path.dirname(fromAbs), spec);
	const candidates = [
		base,
		`${base}.ts`,
		`${base}.tsx`,
		`${base}.js`,
		`${base}.jsx`,
		path.join(base, "index.ts"),
		path.join(base, "index.tsx"),
		path.join(base, "index.js"),
		path.join(base, "index.jsx"),
	];
	for (const c of candidates) {
		if (await fileExists(c)) return c;
	}
	return null;
};
