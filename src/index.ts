#!/usr/bin/env node
import { Command } from "commander";
import { z } from "zod";
import { reviewRepositoryDiff } from "./modules/core/reviewer.js";

const program = new Command();

program
	.name("ai-code-review")
	.description(
		"AI code review CLI: reviews diffs between two commits with RAG + LLM",
	)
	.requiredOption("--repo <url>", "Git repository URL (https, ssh supported)")
	.requiredOption("--source <sha|ref>", "Source commit/ref to diff from")
	.requiredOption("--target <sha|ref>", "Target commit/ref to diff to")
	.option("--workdir <path>", "Working directory for cloning; defaults to tmp")
	.option("--rag-url <url>", "RAG base URL for knowledge retrieval")
	.option("--rag-key <key>", "RAG API key")
	.option(
		"--llm-base-url <url>",
		"OpenAI-compatible base URL",
		process.env.LLM_BASE_URL,
	)
	.option("--llm-api-key <key>", "LLM API key", process.env.LLM_API_KEY)
	.option(
		"--llm-model <model>",
		"LLM model name",
		process.env.LLM_MODEL || "gpt-4o-mini",
	)
	.option("--format <fmt>", "Output format: json|md|both", "both")
	.option("--output <path>", "Write output to file (for md or json)")
	.option(
		"--max-tokens <n>",
		"Max tokens for LLM",
		(v) => Number.parseInt(v, 10),
		1200,
	)
	.option(
		"--temperature <n>",
		"LLM temperature",
		(v) => Number.parseFloat(v),
		0.2,
	)
	.option("--no-color", "Disable color output")
	.version("0.1.0");

program.action(async (opts) => {
	const OptionsSchema = z.object({
		repo: z.string().url().or(z.string().startsWith("git@")),
		source: z.string().min(1),
		target: z.string().min(1),
		workdir: z.string().optional(),
		ragUrl: z.string().url().optional(),
		ragKey: z.string().optional(),
		llmBaseUrl: z.string().url().optional(),
		llmApiKey: z.string().optional(),
		llmModel: z.string().default("gpt-4o-mini"),
		format: z.enum(["json", "md", "both"]).default("both"),
		output: z.string().optional(),
		maxTokens: z.number().int().positive().max(8192).default(1200),
		temperature: z.number().min(0).max(2).default(0.2),
	});

	const parsed = OptionsSchema.parse({
		repo: opts.repo,
		source: opts.source,
		target: opts.target,
		workdir: opts.workdir,
		ragUrl: opts.ragUrl,
		ragKey: opts.ragKey,
		llmBaseUrl: opts.llmBaseUrl,
		llmApiKey: opts.llmApiKey,
		llmModel: opts.llmModel,
		format: opts.format,
		output: opts.output,
		maxTokens: opts.maxTokens,
		temperature: opts.temperature,
	});

	const result = await reviewRepositoryDiff({
		repoUrl: parsed.repo,
		sourceRef: parsed.source,
		targetRef: parsed.target,
		workdir: parsed.workdir,
		rawRagConfig: parsed.ragUrl
			? { baseUrl: parsed.ragUrl, apiKey: parsed.ragKey }
			: undefined,
		rawLlmConfig:
			parsed.llmBaseUrl && parsed.llmApiKey
				? {
						baseUrl: parsed.llmBaseUrl,
						apiKey: parsed.llmApiKey,
						model: parsed.llmModel,
						maxTokens: parsed.maxTokens,
						temperature: parsed.temperature,
					}
				: undefined,
		format: parsed.format,
		outputPath: parsed.output,
	});

	if (!result.ok) {
		console.error("Review failed:", result.errorMessage);
		process.exit(1);
	}

	if (result.outputPath) {
		console.log(`Wrote review to ${result.outputPath}`);
	} else {
		console.log(result.output);
	}
});

program.parseAsync(process.argv);
