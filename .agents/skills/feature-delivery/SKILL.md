---
name: feature-delivery
description: Establish a small runnable foundation and deliver application capabilities sequentially with module boundaries, focused verification, feature-scoped commits, and resumable handoffs. Use for repository setup or incremental feature implementation under this workflow.
---

# Feature delivery

Use the repository's AGENTS.md and engineering docs as the source of project rules. This skill does not depend on optional plugins or a particular frontend framework.

## Begin

Inspect the actual checkout, Git state, current feature and existing public APIs. If `docs/engineering/STATUS.md` exists, verify its claims against the repository. Read the current feature spec, not every future feature. Preserve user changes and established decisions.

For a new project, first establish the smallest runnable foundation with the agreed toolchain, module-boundary checks and CI smoke. Add business contracts with their first real feature; do not implement every future feature's architecture in advance.

## Deliver one capability

1. Record the user outcome, non-goals, dependencies, public contract, ownership and observable acceptance examples. Use the repository feature template when available.
2. Plan and implement one vertical slice, including integration with existing capabilities. Keep feature internals private and coordinate features at the application boundary.
3. Verify changed behavior with focused tests or browser checks appropriate to its risk. Use a failing regression/example first for non-trivial logic and bug fixes. Check relevant failure states and accessibility; do not write tests that merely mirror trivial code.
4. Review the actual complete diff and consumers, resolve concrete defects, and inspect staged changes.
5. When local commits are authorized, commit the completed feature with a coherent scope. Do not bundle unrelated features or reconstruct a fictional history after the whole app is built.
6. Record actual evidence, commit reference when available, limitations and the next concrete step. Continue the authorized feature sequence without routine permission gates.

## Boundaries

- Foundation utilities remain business-agnostic; domain contracts can be business-specific and shared by genuine consumers.
- UI, adapters, state and tests for a feature belong together. Do not introduce a global store/service or sibling-feature dependency as a shortcut.
- Separate client and server entry points. Runtime validation complements static types at external boundaries.
- If a check cannot run, name the reason and leave the feature explicitly unverified in that respect. Do not claim policy documents are automated enforcement.
- Parallel agents, external publication and shared-history changes require the authorization applicable to the current task; this skill does not grant it.

Load implementation-specific skills only when useful to the current capability. Their snippets must be checked against the installed runtime and repository contracts. Keep personal architectural rationale distinct from generated code descriptions.
