# StarLang 0.10.1 consumer boundary

## Analysis
The pinned generated release uses flat lowerCamelCase, integer Unix timestamps,
required id/dataset, typed references and string decimals. The historical v0.9
nested data envelope is not equivalent. Operation and alert do not exist in the
release's document inventory.

## Design and decision
Consume the exact generated release; validate concrete dtypes before writes.
Keep zero runtime dependencies with a schema interpreter restricted to the actual
release constructs. Reject legacy writes rather than guessing migrations. Preserve
operation/alert application payloads under explicit document extensions. Read-only
legacy message rendering remains available. No database conversion or deployment.

## Adversarial checks
Tests reject nested envelopes, old version claims, unknown fields/dtypes, numeric
confidence, out-of-range decimals and mixed canonical/legacy write batches. Opaque
extension keys retain their spelling and values. Full release hashing fails on
artifact drift. Existing operation updates require the explicit canonical payload.

## Verification
35 deterministic tests passed with Node 24 using `node --test test/*.test.js`.
`python3 scripts/sync-starintel-consumer.py --offline` passed. Nix is unavailable
in the editing container; flake and exact-commit remote CI remain required.
