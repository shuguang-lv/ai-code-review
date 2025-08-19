import type { ParsedDiff } from "../types.js";

export const analyzeCodeSmells = (parsed: ParsedDiff) => {
	const smells: Array<{
		file: string;
		line: number;
		kind: string;
		message: string;
		severity: "critical" | "major" | "minor" | "nit";
		suggestion?: string;
	}> = [];

	for (const file of parsed.files) {
		for (const hunk of file.hunks) {
			for (const line of hunk.addedLines) {
				if (line.content.length > 200) {
					smells.push({
						file: file.path,
						line: line.lineNumber,
						kind: "long-line",
						message:
							"Line exceeds 200 characters; consider breaking it up for readability.",
						severity: "nit",
						suggestion: "Extract variables or wrap long strings.",
					});
				}
				if (/console\.(log|debug|dir)\(/.test(line.content)) {
					smells.push({
						file: file.path,
						line: line.lineNumber,
						kind: "console-log",
						message: "Debug logging left in code.",
						severity: "minor",
						suggestion: "Remove console logs or guard under debug flag.",
					});
				}
				if (/any\b/.test(line.content)) {
					smells.push({
						file: file.path,
						line: line.lineNumber,
						kind: "weak-typing",
						message: "Usage of any weakens type safety.",
						severity: "major",
						suggestion: "Replace any with precise types or generics.",
					});
				}
				if (/TODO|FIXME/.test(line.content)) {
					smells.push({
						file: file.path,
						line: line.lineNumber,
						kind: "todo-leftover",
						message: "Leftover TODO/FIXME in code.",
						severity: "minor",
						suggestion: "File an issue or resolve before merging.",
					});
				}
			}
		}
	}

	return smells;
};
