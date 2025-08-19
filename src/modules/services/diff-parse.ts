import type { ParsedDiff, ParsedHunk } from "../types.js";

export const analyzeUnifiedDiff = (diffText: string): ParsedDiff => {
	const files: ParsedDiff["files"] = [];
	let currentPath: string | null = null;
	let currentHunks: ParsedHunk[] = [];
	let added = 0;
	let deleted = 0;

	const flushFile = () => {
		if (currentPath) {
			files.push({ path: currentPath, status: "M", hunks: currentHunks });
		}
		currentPath = null;
		currentHunks = [];
	};

	const lines = diffText.split("\n");
	let targetLineStart = 0;
	let targetLine = 0;

	for (const line of lines) {
		if (line.startsWith("diff --git")) {
			flushFile();
			currentPath = null;
			continue;
		}
		if (line.startsWith("+++ ")) {
			const match = line.match(/^\+\+\+ b\/(.*)$/);
			currentPath = match ? match[1] : "unknown";
			continue;
		}
		if (line.startsWith("@@")) {
			const m = line.match(/\+([0-9]+)(?:,([0-9]+))?/);
			targetLineStart = m ? Number.parseInt(m[1], 10) : 1;
			targetLine = targetLineStart;
			currentHunks.push({
				filePath: currentPath || "unknown",
				targetStart: targetLineStart,
				targetEnd: targetLineStart,
				addedLines: [],
			});
			continue;
		}
		if (line.startsWith("+") && !line.startsWith("+++")) {
			added++;
			if (currentHunks.length > 0) {
				const h = currentHunks[currentHunks.length - 1];
				h.addedLines.push({ lineNumber: targetLine, content: line.slice(1) });
				h.targetEnd = Math.max(h.targetEnd, targetLine);
			}
			targetLine++;
			continue;
		}
		if (line.startsWith("-") && !line.startsWith("---")) {
			deleted++;
			// deletions do not advance target line
			continue;
		}
		// context line advances target line
		if (
			!line.startsWith("diff --git") &&
			!line.startsWith("index") &&
			!line.startsWith("---") &&
			!line.startsWith("+++") &&
			!line.startsWith("@@")
		) {
			if (currentHunks.length > 0) {
				const h = currentHunks[currentHunks.length - 1];
				h.targetEnd = Math.max(h.targetEnd, targetLine);
			}
			targetLine++;
		}
	}

	flushFile();

	return {
		files,
		summary: { added, deleted, filesChanged: files.length },
	};
};
