# AI architecture — PLANNED / NOT YET IMPLEMENTED

The intended copilot helps people investigate incidents; it does not turn unverified evidence into certainty or replace human operational judgment. There is no AI provider/model selection or AI execution in the repository.

## Intended direction

After investigation UI and bounded context assembly, explore structured outputs with validated fields, source citations, explicit uncertainty, hypothesis assistance, missing-information identification and possible next-step suggestions. Distinguish generated analysis from human records and original sources.

Retrieval-augmented generation (RAG) could bring relevant knowledge into context. pgvector/vector retrieval is conditional on later approval and requirements; no extension, embeddings, ingestion or retrieval pipeline exists now.

LLM tool calling must be independently authorized server-side for the current actor/tenant and specific operation. A model-selected tool name/argument is untrusted input, not authority. Recheck permissions, validate arguments and review side-effect controls before any write capability. Do not execute an ACTION note as a command.

Provider, model, cost/latency limits, evaluation criteria, prompt-injection defenses and retention policies remain open decisions. These plans add no runtime functionality.
