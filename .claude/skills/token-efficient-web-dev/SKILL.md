---
name: token-efficient-web-dev
description: Build and maintain websites in Claude Code with minimal unnecessary context, tool calls, file reads, and repeated work. Use for coding, debugging, refactoring, and shipping website features.
---

# Token-Efficient Web Development

## Working rules
- Start by identifying the user's concrete goal and inspect only files needed for that goal.
- Prefer targeted searches and small file excerpts over dumping whole files or directory trees.
- Never inspect dependency folders, build outputs, coverage, minified bundles, or generated assets unless the task specifically requires them.
- Check existing project instructions and conventions before making changes.
- Do not repeat project discovery or restate known context when it is already available.
- Make the smallest complete change that solves the problem; avoid unrelated refactors.
- Do not add packages or services unless there is a clear need. Prefer existing dependencies and platform capabilities.
- Do not generate lengthy explanations unless requested. Report concise findings and actions.
- Avoid running the same command or test repeatedly unless the prior result was inconclusive or code changed.
- For errors, capture the relevant error and inspect the smallest relevant code path before proposing a fix.
- Do not claim tests, builds, or deployments succeeded unless they were actually run and succeeded.

## Workflow
1. Briefly state the plan for multi-file or risky work; for small tasks, proceed directly.
2. Inspect relevant files and current git diff/status where available.
3. Implement the smallest complete change.
4. Run the narrowest relevant validation first.
5. Summarize changed files, tests actually run, results, and any unresolved issue in a few bullets.

## Context management
- If the task is unrelated to the current conversation, recommend starting a fresh session rather than carrying unrelated context forward.
- If a session becomes long, summarize only durable project facts, decisions, changed files, current blockers, and next steps.
- Do not create large project summaries that duplicate source code or documentation.
- Keep project-level instructions concise; put detailed repeatable procedures in separate skills.
- Ask a question only if a missing decision blocks progress; otherwise use sensible defaults and state important assumptions briefly.

## Website-specific guidance
- Preserve the existing stack, architecture, design language, and working behavior unless the user requests a change.
- Check responsive behavior, accessibility basics, loading/error/empty states, and security implications when relevant.
- Avoid rewriting whole components for a small visual or functional fix.
- For UI changes, inspect the relevant component and styles, then validate the affected route or component when possible.
