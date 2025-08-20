import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { z } from 'zod';
import {
  buildCodeGraph,
  getRelevantDefinitionsForFiles,
  summarizeDefinitions,
} from '../analysis/code-graph.js';
import { analyzeCodeSmells } from '../analysis/linters.js';
import { renderJson, renderMarkdown } from '../renderers/output.js';
import { analyzeUnifiedDiff } from '../services/diff-parse.js';
import { cloneAndPrepare, getCommitMessages, getUnifiedDiff } from '../services/git.js';
import { LlmClient } from '../services/llm.js';
import { RagClient } from '../services/rag.js';
import { ReviewCommentSchema } from '../types.js';
import { verifyComments } from '../verification/scripts.js';
import { chunkParsedDiff, summarizeChunkForPrompt } from './chunker.js';

export type ReviewOutcome =
  | {
      ok: true;
      output: string;
      outputPath?: string;
    }
  | {
      ok: false;
      errorMessage: string;
    };

type CodeSmell = {
  file: string;
  line: number;
  severity: 'critical' | 'major' | 'minor' | 'nit';
  kind: string;
  message: string;
  suggestion?: string;
};

type HunkSummary = {
  targetStart: number;
  targetEnd: number;
  addedCount: number;
  preview: Array<{ n: number; c: string }>;
};

type PromptInput = {
  parsedDiff: {
    summary: { added: number; deleted: number; filesChanged: number };
    files: Array<{ path: string; hunks: HunkSummary[] }>;
  };
  smells: CodeSmell[];
  codeGraph: {
    graphSummary: { hotspots: Array<{ file: string; degree: number }> };
    defs: Record<
      string,
      Array<{
        name: string;
        kind: string;
        pos: { line: number; character: number };
      }>
    >;
    imports: Array<{ source: string; names: string[] }>;
    exports: Array<{ name: string; kind: string }>;
    neighborDefs: Record<
      string,
      Array<{
        name: string;
        kind: string;
        pos: { line: number; character: number };
      }>
    >;
  };
  ragContext?: unknown;
  intent: Array<{ hash: string; subject: string }>;
};

type RagResponse =
  | {
      results?: unknown[];
      data?: unknown[];
    }
  | unknown[];

export const reviewRepositoryDiff = async (args: {
  repoUrl: string;
  sourceRef: string;
  targetRef: string;
  workdir?: string;
  rawRagConfig?: { baseUrl: string; apiKey?: string };
  rawLlmConfig?: {
    baseUrl: string;
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
  };
  format: 'json' | 'md' | 'both';
  outputPath?: string;
  stream?: boolean;
}): Promise<ReviewOutcome> => {
  try {
    const workingDirectory = args.workdir ?? path.join(os.tmpdir(), `ai-code-review-${Date.now()}`);
    const git = await cloneAndPrepare({
      repoUrl: args.repoUrl,
      workdir: workingDirectory,
    });
    const unifiedDiff = await getUnifiedDiff(git, args.sourceRef, args.targetRef);
    const parsed = analyzeUnifiedDiff(unifiedDiff);
    const smells = analyzeCodeSmells(parsed);

    const {
      graph,
      definitions,
      relevantDefinitions,
      summary: graphSummary,
      fileMeta,
    } = await buildCodeGraph(parsed, workingDirectory);

    const commitLogs = await getCommitMessages(git, args.sourceRef, args.targetRef);

    const rag = args.rawRagConfig ? new RagClient(args.rawRagConfig) : undefined;
    const llm = args.rawLlmConfig ? new LlmClient(args.rawLlmConfig) : undefined;

    const ragContextRaw = rag
      ? await rag.query({
          query: `Best practices for reviewing diffs involving: ${[
            ...new Set(parsed.files.map((f) => path.extname(f.path))),
          ].join(', ')}`,
          tags: ['code-review', 'best-practices', 'smells'],
        })
      : undefined;
    const ragContext = slimRagContext(ragContextRaw);

    const system =
      'You are an expert senior engineer performing a rigorous code review. Follow context-engineering best practices: PR/Issue indexing, code graph analysis, custom review instructions, linters/static analyzers, web/RAG queries, and verification scripts as described in the CodeRabbit blog.';

    const chunks = chunkParsedDiff(parsed, Math.max(800, args.rawLlmConfig?.maxTokens ?? 1200));
    const allComments: Array<z.infer<typeof ReviewCommentSchema>> = [];
    const changedFiles = new Set(parsed.files.map((f) => f.path));

    // PASS 1: generate issues per chunk (slightly higher temperature)
    for (const chunk of chunks) {
      const chunkSummary = summarizeChunkForPrompt(parsed, chunk);
      const chunkFiles = [chunk.filePath];
      const defsForChunk = getRelevantDefinitionsForFiles(chunkFiles, graph, definitions, 3000);
      const defsSlim = Object.fromEntries(
        Object.entries(defsForChunk).map(([f, defs]) => [f, summarizeDefinitions(defs, 12, false)])
      );
      const meta = fileMeta[chunk.filePath] ?? { imports: [], exports: [] };
      const metaSlim = {
        imports: meta.imports.slice(0, 8),
        exports: meta.exports.slice(0, 8),
      };
      const neighbors = new Set<string>([
        ...graph.edges.filter((e) => e.from === chunk.filePath).map((e) => e.to),
        ...graph.edges.filter((e) => e.to === chunk.filePath).map((e) => e.from),
      ]);
      const neighborDefs = Array.from(neighbors)
        .slice(0, 6)
        .reduce(
          (
            acc: Record<
              string,
              Array<{
                name: string;
                kind: string;
                pos: { line: number; character: number };
              }>
            >,
            f
          ) => {
            acc[f] = summarizeDefinitions(
              (definitions[f] ?? []).filter((d) => d.exported),
              8,
              false
            );
            return acc;
          },
          {} as Record<
            string,
            Array<{
              name: string;
              kind: string;
              pos: { line: number; character: number };
            }>
          >
        );

      const candidateSmells = smells.filter(
        (s) =>
          s.file === chunk.filePath &&
          chunkSummary.hunks?.some(
            (h: HunkSummary) => s.line >= h.targetStart && s.line <= h.targetEnd
          )
      );
      const smellsSlim = selectTopSmells(candidateSmells, 20);

      const intentSlim = commitLogs.slice(0, 5).map((l) => ({
        hash: l.hash.slice(0, 7),
        subject: truncate(l.subject, 120),
      }));

      const userPrompt = buildPrompt({
        parsedDiff: {
          summary: parsed.summary,
          files: [{ path: chunk.filePath, hunks: chunkSummary.hunks }],
        },
        smells: smellsSlim,
        codeGraph: {
          graphSummary: { hotspots: (graphSummary.hotspots ?? []).slice(0, 5) },
          defs: defsSlim,
          imports: metaSlim.imports,
          exports: metaSlim.exports,
          neighborDefs,
        },
        ragContext,
        intent: intentSlim,
      });

      let content = '';
      if (llm) {
        const resp = await llm.chat({
          system,
          user: userPrompt,
          temperature: Math.min(1.0, (args.rawLlmConfig?.temperature ?? 0.2) + 0.2),
          maxTokens: Math.min(1000, args.rawLlmConfig?.maxTokens ?? 1200),
        });
        content = resp.content;
      }

      const comments = verificationFilter(safeParseComments(content), changedFiles);
      allComments.push(...comments);
    }

    const prelimComments =
      allComments.length > 0
        ? allComments
        : verificationFilter(smellsToComments(smells), changedFiles);

    // PASS 2: refine & deduplicate (low temperature, smaller context)
    let refined: Array<z.infer<typeof ReviewCommentSchema>> = prelimComments;
    if (llm && prelimComments.length > 0) {
      const refinePrompt = buildRefinePrompt(prelimComments.slice(0, 60));
      const resp = await llm.chat({
        system: 'You consolidate review comments.',
        user: refinePrompt,
        temperature: 0.1,
        maxTokens: 600,
      });
      const refinedParsed = safeParseComments(resp.content);
      if (refinedParsed.length > 0) refined = refinedParsed;
    }

    const defsByFile: Record<string, Array<{ name: string }>> = {};
    for (const [file, defs] of Object.entries(definitions)) {
      defsByFile[file] = defs.map((d) => ({ name: d.name }));
    }
    const verification = await verifyComments(refined, {
      repoDir: workingDirectory,
      definitionsByFile: defsByFile,
      minSuggestionChars: 16,
    });
    const finalComments = verification.kept;

    const outputs = {
      json: renderJson(finalComments),
      md: renderMarkdown(finalComments, {
        diffSummary: parsed.summary,
        codeGraph: { summary: graphSummary, relevantDefinitions },
        ragContext,
      }),
    };

    let output = outputs.md;
    if (args.format === 'json') output = outputs.json;
    if (args.format === 'both') output = `${outputs.md}\n\n\`\`\`json\n${outputs.json}\n\`\`\``;

    if (args.outputPath) {
      await writeFile(args.outputPath, output, 'utf8');
      return { ok: true, output, outputPath: args.outputPath };
    }
    return { ok: true, output };
  } catch (err: unknown) {
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
};

const buildPrompt = (input: PromptInput): string => {
  return [
    '# Objective',
    'Return a JSON array of review comments for the diff. Each comment must follow the schema:',
    JSON.stringify(ReviewCommentSchema.shape, null, 2),
    '',
    '# Context',
    '## Diff summary',
    JSON.stringify(input.parsedDiff.summary, null, 2),
    '## Heuristic smells (top)',
    JSON.stringify(input.smells, null, 2),
    '## Imports/Exports',
    JSON.stringify({ imports: input.codeGraph.imports, exports: input.codeGraph.exports }, null, 2),
    '## Neighbor exported symbols',
    JSON.stringify(input.codeGraph.neighborDefs, null, 2),
    '## Relevant symbol definitions',
    JSON.stringify(input.codeGraph.defs, null, 2),
    input.ragContext ? `## RAG context\n${JSON.stringify(input.ragContext, null, 2)}` : '',
    '',
    '# Instructions',
    '- Use precise file paths and 1-based line numbers in the target revision.',
    '- Explain the smell clearly and propose a concrete fix suggestion.',
    '- Severity: critical|major|minor|nit.',
    "- Only output JSON. Don't include any markdown.",
  ]
    .filter(Boolean)
    .join('\n');
};

const buildRefinePrompt = (comments: Array<z.infer<typeof ReviewCommentSchema>>): string => {
  return [
    'You are refining AI code review comments.',
    '- Remove duplicates.',
    '- Merge overlapping comments on same file/line.',
    '- Keep the clearest rationale and the most actionable suggestion.',
    '- Output JSON array with the same schema.',
    JSON.stringify(comments, null, 2),
  ].join('\n');
};

const safeParseComments = (content: string) => {
  try {
    const parsed = JSON.parse(content);
    const arr = Array.isArray(parsed) ? parsed : parsed?.comments;
    if (!Array.isArray(arr)) return [];
    const results = [] as Array<z.infer<typeof ReviewCommentSchema>>;
    for (const item of arr) {
      const parsedItem = ReviewCommentSchema.safeParse(item);
      if (parsedItem.success) results.push(parsedItem.data);
    }
    return results;
  } catch {
    return [];
  }
};

const smellsToComments = (smells: CodeSmell[]) => {
  return smells.map((s: CodeSmell) => ({
    file: s.file,
    line: s.line,
    severity: s.severity ?? 'minor',
    smell: s.kind,
    rationale: s.message,
    suggestion: s.suggestion ?? 'Consider refactoring as per best practices.',
  }));
};

const verificationFilter = (
  comments: Array<z.infer<typeof ReviewCommentSchema>>,
  changedFiles: Set<string>
) => {
  return comments.filter((c) => c.line > 0 && changedFiles.has(c.file));
};

const selectTopSmells = (smells: CodeSmell[], limit: number) => {
  const score = (s: CodeSmell) =>
    (({ critical: 4, major: 3, minor: 2, nit: 1 }) as const)[s.severity ?? 'minor'];
  return smells
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit)
    .map((s) => ({
      file: s.file,
      line: s.line,
      severity: s.severity,
      kind: s.kind,
      message: truncate(s.message, 200),
      suggestion: s.suggestion ? truncate(s.suggestion, 200) : undefined,
    }));
};

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const slimRagContext = (input: RagResponse | undefined) => {
  try {
    if (!input) return undefined;
    const arr = Array.isArray(input) ? input : input?.results || input?.data;
    if (!Array.isArray(arr)) return input;
    return arr.slice(0, 3);
  } catch {
    return undefined;
  }
};
