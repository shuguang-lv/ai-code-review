import type { ParsedDiff } from "../types.js";

export type DiffChunk = {
  filePath: string;
  hunks: number[]; // indices of hunks in that file
  tokenEstimate: number;
};

export const chunkParsedDiff = (parsed: ParsedDiff, maxTokensPerChunk = 1200): DiffChunk[] => {
  const chunks: DiffChunk[] = [];
  for (const file of parsed.files) {
    let current: DiffChunk | null = null;
    for (let i = 0; i < file.hunks.length; i++) {
      const h = file.hunks[i];
      const est = estimateHunkTokens(h.addedLines);
      if (!current || current.tokenEstimate + est > maxTokensPerChunk || current.filePath !== file.path) {
        if (current) chunks.push(current);
        current = { filePath: file.path, hunks: [], tokenEstimate: 0 };
      }
      current.hunks.push(i);
      current.tokenEstimate += est;
    }
    if (current) chunks.push(current);
  }
  // already grouped by file; could further merge small adjacent files if needed
  return chunks;
};

const estimateHunkTokens = (lines: Array<{ lineNumber: number; content: string }>) => {
  const lengthCost = lines.reduce((acc, l) => acc + Math.ceil(l.content.length / 4), 0); // ~4 chars/token
  const base = 32 + lines.length * 2; // structure overhead
  return Math.max(80, base + lengthCost);
};

export const summarizeChunkForPrompt = (parsed: ParsedDiff, chunk: DiffChunk) => {
  const file = parsed.files.find(f => f.path === chunk.filePath);
  if (!file) return { filePath: chunk.filePath, summary: "" } as any;
  const hSummaries = chunk.hunks.map(idx => {
    const h = file.hunks[idx];
    return {
      targetStart: h.targetStart,
      targetEnd: h.targetEnd,
      addedCount: h.addedLines.length,
      preview: h.addedLines.slice(0, 8).map(l => ({ n: l.lineNumber, c: l.content.slice(0, 240) }))
    };
  });
  return { filePath: file.path, hunks: hSummaries } as any;
};
