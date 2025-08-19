# AI Code Review CLI

A Node.js + TypeScript CLI that reviews diffs between two commits using an OpenAI-compatible LLM and a remote RAG knowledge base. Architecture follows CodeRabbit's context engineering principles.

## Install

```bash
npm i
npm run build
```

## Usage

```bash
node dist/index.js \
  --repo <git_url> \
  --source <commit_or_ref> \
  --target <commit_or_ref> \
  --llm-base-url https://api.openai.com \
  --llm-api-key $OPENAI_API_KEY \
  --llm-model gpt-4o-mini \
  --rag-url https://your-rag.example.com \
  --rag-key $RAG_API_KEY \
  --format both \
  --output review.md
```

## Reference

- Context engineering approach inspired by CodeRabbit: [Context Engineering: Level up your AI Code Reviews](https://www.coderabbit.ai/blog/context-engineering-ai-code-reviews)
