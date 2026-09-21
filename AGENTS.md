# AGENTS.md

These instructions apply to the entire repository.

## Repository mission

Node-RED palette for the StarIntel / prolog-rlm / hackmode integration line
(see README for this repository's specific scope). Nodes are plain npm
packages with **zero runtime dependencies**; they shell out to the upstream
runtimes (SWI-Prolog `prolog-rlm` CLI, `starintel-server` HTTP API, hackmode
lisp image) rather than embedding them.

## Design mode

**Auto-RAGE** is the recorded design mode for this repository, selected
explicitly by the operator on 2026-09-20 (`/auto-rage`). Workers run the full
ADADR loop (Analyze -> Design -> Adversarial review -> recorded Decision ->
Realize) and record evidence under `docs/research/` (design records) and
`rage/` (run logs) without waiting for human approval gates. Do not ask again;
also do not silently widen this to other repositories.

## Invariants

- Spawn subprocesses with `execFile`/argv arrays only. Never interpolate user
  input into a shell string.
- Credentials pass as environment variables referenced by *name*; never in
  argv, never in logs, never stored in flow files.
- Kill long-running subprocesses with a hard timer; map upstream budgets to
  both CLI flags and JS-side timeouts.
- `starintel-server` has no authentication: LAN-only by contract; never add
  credential storage for it.
- Cross-package composition uses Node-RED config-node *types*; degrade to a
  configuration error when the type is missing rather than crashing.
- Tests are deterministic and offline: fake runtime fixtures, no network, no
  sleep-based synchronization.

## Development workflow

TDD: add/strengthen the deterministic test first where practical, then the
smallest coherent node change, then run the suite.

```sh
node --test test/          # deterministic suite
nix flake check            # offline flake gate
```

Work happens in dedicated worktrees under `~/git/worktrees/<repo>-<slug>`;
the primary checkout in `~/Documents/Projects` stays on its default branch.

## Git discipline

Canonical branch `main`. Issue-scoped branches `rage/<issue>-<slug>`. Never
rewrite `main`. Never commit credentials or local environment artifacts.
