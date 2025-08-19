import { z } from 'zod';

export const ReviewCommentSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  severity: z.enum(['critical', 'major', 'minor', 'nit']),
  smell: z.string(),
  rationale: z.string(),
  suggestion: z.string()
});

export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

export type ParsedHunk = {
  filePath: string;
  targetStart: number;
  targetEnd: number;
  addedLines: Array<{ lineNumber: number; content: string }>;
};

export type ParsedDiff = {
  files: Array<{ path: string; status: 'A'|'M'|'D'|'R'; hunks: ParsedHunk[] }>;
  summary: { added: number; deleted: number; filesChanged: number };
};
