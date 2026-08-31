# Multi-agent work management: primary-source research

**Research date:** 2026-08-30  
**Scope:** How agent systems decompose, route, execute, validate, stop, recover, expose progress, request human approval, and preserve provenance. This note compares those patterns with Shane's August 30 project workflow diagram.  
**Evidence rule:** Statements labeled **Primary** summarize first-party documentation or repositories. Statements labeled **Inference** are recommendations derived from those sources for the Fleet workflow.

## Bottom line

**Inference:** The best umbrella term for Shane's design is **an orchestrated multi-agent workflow**, not a swarm. The diagram already has the correct enterprise-shaped spine: one accountable owner, bounded task assignments, task-level validation, project-level acceptance, and an explicit close. The agent-systems literature suggests seven additions:

1. Decide first whether multiple agents are needed.
2. Distinguish parallel worker dispatch from a transfer-of-control handoff.
3. Persist a canonical project/task state outside any one agent's context.
4. Bound every execution and rework loop with success and safety termination conditions.
5. Add human approval before consequential actions, not only at final acceptance.
6. Trace dispatches, tool calls, handoffs, retries, evidence, and identities end to end.
7. Add an integration/convergence gate after individual tasks pass and before the project is accepted.

## Is “swarm” the right term?

**Primary:** No, not as the general term.

- Anthropic calls the broad family **agentic systems** and distinguishes **workflows** (predetermined code paths) from **agents** (the model dynamically directs its process and tools). It recommends starting with the simplest design that works. [Anthropic, “Building effective agents,” published 2024-12-19](https://www.anthropic.com/engineering/building-effective-agents)
- LangChain calls the umbrella **multi-agent systems** and documents subagents, handoffs, skills, routers, and custom workflows as different patterns. It also warns that a single agent with the right tools may be enough. [LangChain multi-agent overview](https://docs.langchain.com/oss/python/langchain/multi-agent/index)
- OpenAI calls the umbrella **agent orchestration**. Its two common multi-agent patterns are manager-owned “agents as tools” and handoffs that transfer active control to a specialist. [OpenAI Agents SDK: agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/)
- OpenAI's repository named **Swarm** describes an experimental educational framework built around agents and handoffs; the repository now says it has been replaced by the production-ready OpenAI Agents SDK. [OpenAI Swarm repository](https://github.com/openai/swarm)
- AutoGen uses **Swarm** for a specific decentralized pattern: agents share message context, make local decisions, and transfer control through handoff messages until a termination condition fires. It contrasts this with a central orchestrator. [AutoGen Swarm](https://microsoft.github.io/autogen/dev/user-guide/agentchat-user-guide/swarm.html)

**Inference:** Use these terms deliberately:

| Term | Use it when |
|---|---|
| Orchestrated multi-agent workflow | General Fleet process; one coordinator/owner controls decomposition and convergence |
| Orchestrator-worker | The coordinator dynamically decomposes work, dispatches agents, and synthesizes results |
| Parallel workers | Independent tasks can run simultaneously and later be aggregated |
| Handoff | Control and active context intentionally transfer to another agent |
| Swarm | Peer agents locally decide who takes over next; do not use it as a synonym for all multi-agent work |

“Frontier Labs” did not resolve to one authoritative company: web results identify multiple unrelated organizations using that name. I did not attribute practices to any of them. I treated “frontier labs” as the category and used current first-party Anthropic and OpenAI sources instead.

## What the primary sources actually do

### 1. Decomposition and routing

**Primary:** Anthropic's established patterns are prompt chaining, routing, parallelization, orchestrator-workers, and evaluator-optimizer. Its orchestrator dynamically decomposes work whose subtasks cannot be known in advance, delegates the pieces, and synthesizes worker outputs. Parallelization is different: it is best when independent pieces are already identifiable. [Anthropic, “Building effective agents”](https://www.anthropic.com/engineering/building-effective-agents)

**Primary:** LangGraph expresses the same orchestrator-worker pattern. Its `Send` API creates workers dynamically; each worker gets its own state, while worker outputs are written to a shared state key available to the orchestrator for synthesis. [LangGraph workflows and agents](https://docs.langchain.com/oss/python/langgraph/workflows-agents)

**Primary:** LangChain routers may dispatch zero or more specialists in parallel and then synthesize results. A supervisor/subagent pattern is more appropriate when routing must evolve over multiple turns. [LangChain router](https://docs.langchain.com/oss/python/langchain/multi-agent/router)

**Inference for the diagram:** Add a choice after “Ready to start?”:

`single agent / fixed workflow / parallel workers / orchestrator-worker / handoff`

Do not fan work out merely because several agents exist. Parallelize only tasks without unresolved dependencies. Use a handoff only when the receiver should take control, not merely contribute a bounded deliverable.

### 2. Context and shared state

**Primary:** Anthropic's current Managed Agents beta lets a coordinator delegate to agents that run in persistent, context-isolated threads. The agents share a sandbox, filesystem, and vault credentials, but each uses its own configuration and conversation history; the coordinator can return to an earlier worker thread. [Claude Managed Agents: multiagent orchestration, beta header `managed-agents-2026-04-01`](https://platform.claude.com/docs/en/managed-agents/multi-agent)

**Primary:** LangGraph persists graph state as checkpoints. Checkpoints support inspection, pause/resume, time-travel debugging, and fault recovery; on a failed parallel step, successful sibling writes can be retained rather than rerun. [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)

**Primary:** AutoGen's Swarm takes a different approach: all participating agents share the same message context, and the latest handoff chooses the next speaker. [AutoGen Swarm](https://microsoft.github.io/autogen/dev/user-guide/agentchat-user-guide/swarm.html)

**Inference for the diagram:** The Excel project/task register should be the canonical control state; an agent's context is working memory, not the register. Each dispatch should carry only the task's required context, authority, inputs, dependencies, acceptance criteria, and expected evidence. Persist status and evidence after every material transition so a replacement coordinator can resume.

### 3. Worker execution, retries, and stopping

**Primary:** Anthropic says agents should repeatedly obtain ground truth from their environment, may pause for human judgment at checkpoints or blockers, and should have stopping conditions such as a maximum iteration count. It also warns that autonomy can compound errors. [Anthropic, “Building effective agents”](https://www.anthropic.com/engineering/building-effective-agents)

**Primary:** The OpenAI Agents SDK runner continues when an agent calls a tool or hands off, returns when it classifies an output as final, and raises `MaxTurnsExceeded` when the configured turn limit is exceeded. Its current documentation also distinguishes retryable model/conversation errors and durable-execution integrations for long-running agents. [OpenAI Agents SDK: running agents](https://openai.github.io/openai-agents-python/running_agents/)

**Primary:** AutoGen provides explicit termination conditions for maximum messages, token use, timeout, handoff to a human, a named agent's response, external stop, and other events. Conditions can be combined. [AutoGen termination](https://microsoft.github.io/autogen/0.4.8/user-guide/agentchat-user-guide/tutorial/termination.html)

**Primary:** Claude Managed Agents distinguishes `running`, transient-error `rescheduling`, `idle`, and `terminated`. “Idle” means waiting for input; it is not a business acceptance result. [Claude Managed Agents: session operations](https://platform.claude.com/docs/en/managed-agents/session-operations)

**Inference for the diagram:** Every worker loop needs two different exits:

- **Success condition:** acceptance criteria and required evidence are satisfied.
- **Safety condition:** maximum attempts/turns, elapsed time, cost/token budget, or external stop is reached.

A safety stop must produce `Blocked`, `Failed`, or `Needs owner decision`; it must never translate automatically to `Done`. Retrying should be limited to explicitly retryable failures and must preserve idempotency or deduplication keys for external writes.

### 4. Evaluation and convergence

**Primary:** Anthropic's evaluator-optimizer pattern separates generation from evaluation and loops with feedback when criteria are clear and iteration measurably improves the result. [Anthropic, “Building effective agents”](https://www.anthropic.com/engineering/building-effective-agents)

**Primary:** OpenAI gives the same coded pattern: run a task agent, have an evaluator assess the output, return feedback, and stop when the evaluator says the criteria pass. [OpenAI Agents SDK: agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/)

**Primary:** LangGraph's orchestrator-worker pattern does not end when workers finish; their outputs converge into shared state and the orchestrator synthesizes a final result. [LangGraph workflows and agents](https://docs.langchain.com/oss/python/langgraph/workflows-agents)

**Inference for the diagram:** Keep the independent task validator. Add a second gate after all required tasks pass:

`integrate outputs → test the combined outcome → resolve conflicts/gaps → project-level validation`

Individually valid deliverables can still conflict or fail to produce the promised business outcome. The accountable owner may coordinate integration, but the validator should independently verify the combined result before approver acceptance.

### 5. Human approval and authority

**Primary:** The OpenAI Agents SDK can interrupt a run before a sensitive tool call, serialize the state, and resume after approval or rejection. Approval applies across the whole run, including handed-off and nested agents, and malformed approval inputs fail closed to manual approval. [OpenAI Agents SDK: human in the loop](https://openai.github.io/openai-agents-python/human_in_the_loop/)

**Primary:** LangGraph can checkpoint and pause indefinitely at an interrupt for approval, editing, rejection, or other external input. It warns that code before an interrupt may replay on resume, so side effects must be idempotent. [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)

**Inference for the diagram:** Final project acceptance is necessary but insufficient. Add a decision inside execution:

`Is the next action outside delegated authority or consequential? → pause → named human approves/edits/rejects → resume or replan`

Examples include merge, deploy, secrets, production data, external messages, purchases, destructive operations, and policy exceptions. Approval belongs immediately before the action; it is not implied by assigning the overall task.

### 6. Observability and provenance

**Primary:** The OpenAI Agents SDK records end-to-end traces containing workflow and trace IDs, timestamps, parent-child span links, agent runs, model generations, tool calls, guardrails, and source/destination handoffs. Its current GitHub release at research time was v0.22.0, released August 19, 2026. [OpenAI Agents SDK tracing](https://openai.github.io/openai-agents-python/tracing/) · [v0.22.0 release](https://github.com/openai/openai-agents-python/releases/tag/v0.22.0)

**Primary:** AutoGen uses OpenTelemetry for execution traces and automatically logs runtime message metadata. AutoGen messages carry a `source` field, and its runtime treats messages as the only agent-to-agent communication mechanism. [AutoGen tracing](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tracing.html) · [AutoGen messages and communication](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/framework/message-and-communication.html)

**Primary:** Claude Managed Agents communication is event-based; session, span, and agent events expose state and progress, while reusable agent configurations are versioned and may carry metadata. [Claude Managed Agents events](https://platform.claude.com/docs/en/managed-agents/events-and-streaming) · [agent setup](https://platform.claude.com/docs/en/managed-agents/agent-setup)

**Inference:** Framework provenance and shared-surface authorship are different controls. A trace can prove that “Agent A called tool X,” but it does not prove GitHub or Linear recorded the write under Agent A's own application identity. Anthropic's current multi-agent design explicitly allows agents to share vault credentials, so agent-specific external authorship must be enforced separately.

For each task/run, capture:

- Project ID, task ID, run/trace ID, and parent run ID.
- Dispatching coordinator and executing agent ID/configuration version.
- Input/context snapshot and authority boundary.
- Tool calls, handoffs, retries, checkpoints, timestamps, and status transitions.
- Artifact/evidence references and validator result.
- External credential principal used for each write and the identity returned by that surface.
- Human approval identity, decision, scope, and timestamp.

If a shared surface cannot return the executing agent's verified identity, treat the write as a provenance failure or route it through an explicitly identified proxy workflow; a signature in prose is not equivalent to platform authorship.

## Exact changes to Shane's workflow diagram

### Add

1. **Complexity gate:** “Does this need multiple agents?” Default simpler work to one agent or a deterministic workflow.
2. **Orchestration-mode decision:** fixed chain, parallel workers, dynamic orchestrator-workers, or true handoff.
3. **Dispatch contract:** task ID, bounded output, required inputs, allowed tools/actions, dependencies, acceptance criteria, evidence format, deadline/wake trigger, retry/turn/time budget, executor, validator, and return channel.
4. **Durable checkpoint/state update:** after claim, material action, handoff, blocker, retry, evidence submission, validation, and approval.
5. **Action approval gate:** immediately before consequential work that exceeds delegated authority.
6. **Failure classification:** retryable, blocked on dependency, blocked on human decision, invalid output, unrecoverable failure, canceled.
7. **Bounded evaluator loop:** fail/return with feedback, but stop and escalate when its retry budget is exhausted.
8. **Convergence/integration gate:** synthesize accepted task outputs and test the combined project outcome.
9. **Continuous telemetry/provenance:** identity-bearing trace and returned external author for every shared-surface mutation.

### Change

- Change each worker box from `Acknowledge → Execute → Report` to `Accept/Reject → Claim → Execute with checkpoints → Submit structured result + evidence`.
- Change `Task meets acceptance criteria? No → executor` to `Return feedback if budget remains; otherwise escalate to owner as Failed/Blocked`.
- Change `Are all required tasks accepted? No → Ready/create tasks` to `Wait/continue, resolve dependency, or replan`; do not recreate already accepted tasks.
- Change `All tasks accepted → Awaiting Acceptance` to `Integrate → independently validate combined outcome → Awaiting Acceptance`.
- Distinguish **runtime stopped/idle** from **task validated** and **project accepted**.

### Remove or avoid

- Avoid presenting peer-to-peer “swarm” as the Fleet default. Supervised orchestration is easier to audit and matches the existing accountable-owner design.
- Do not let an agent's conversational “done,” runtime `idle`, merged PR, passing unit test, or exhausted turn budget mark a task or project Done by itself.
- Do not assume shared context is automatically desirable. Give workers the minimum context required and persist canonical state centrally.
- Do not use one shared credential as proof of individual agent provenance.

## Recommended revised control path

```text
Define outcome, owner, DoD, authority, approver
  → Ready gate
  → Need multiple agents?
      ├─ No: single agent / deterministic workflow
      └─ Yes: choose parallel, orchestrator-worker, or handoff
  → Register tasks, dependencies, budgets, executors, validators
  → Agent accepts/rejects and claims
  → Execute with checkpoints, tracing, and environment evidence
      ├─ consequential action → human approval → resume/replan
      ├─ retryable failure → bounded retry
      ├─ blocker/safety stop → owner decision
      └─ result + evidence → independent task validation
  → All required tasks validated
  → Integrate and test the combined outcome
  → Independent project-level validation
  → Named approver accepts
  → Record identities, evidence, exceptions, and acceptance timestamp
  → Done
```

The accountable owner owns the business outcome and canonical record. The orchestrator controls runtime decomposition and convergence. Workers own bounded deliverables. Validators evaluate evidence. Humans retain approval for consequential actions and final acceptance.
