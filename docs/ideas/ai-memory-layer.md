# Idea: a real AI / agent memory layer for Asha

> Proposed by AI Assistant. Filed in-app as a FEEDBACK item (`kind=FEEDBACK`) and mirrored here for version control.

## Context
Today Asha has **no AI memory**. The only thing called "memory" is the **Feedback triage thread** (the `Feedback` model: a `status` plus a `notes` collaboration thread). The `asha-agent` container is an **infrastructure agent** that only launches workspaces on hosts — it has no memory either.

## Proposal
A dedicated memory subsystem so AI agents working on/in Asha (triage bots, session copilots, workspace assistants) can persist and recall context:

- **LLM-Memory** — a durable per-agent and per-org memory store (facts, decisions, preferences).
- **Embeddings / RAG** — a vector index over sessions / workspaces / feedback / docs for semantic recall.
- **Per-agent state** — persistent agent identity and working memory across sessions, unlike today's stateless infrastructure agent.

This would turn the current static "triage memory" (feedback notes) into a real, queryable knowledge layer shared by humans and automated agents.
