# node-red-starintel

StarIntel Node-RED node library: documents, dataset queries, actor
manifests, and the agentic `starintel-rlm` actor node.

Companion palette: [`node-red-prolog-rlm`](https://github.com/starintel-labs/node-red-prolog-rlm)
(the `starintel-rlm` node reuses its `prolog-rlm-runtime` config node).

## Nodes

| Node | Kind | Purpose |
|------|------|---------|
| `starintel-server` | config | server base URL + timeout (LAN-only) |
| `starintel-documents` | i/o | ingest / bulk / get / update / delete / search / arbitrary by-X query |
| `starintel-actors` | i/o | manifest discovery, dispatch (`POST /new/target/:actor`), target listing, manifest publish |
| `starintel-rlm` | i/o | agentic actor: prolog-rlm loop with StarIntel dataset context + optional manifest publish |

`starintel-rlm` is the bridge the StarIntel line wants: it fetches dataset
context from the server, runs the RLM loop through prolog-rlm, returns the
trace envelope on `msg.payload`, and can advertise itself to the dataset as
an `actor-manifest` v0.9 agentic actor.

## Verified server contract

Against `starintel-server` source (`http-capabilities.lisp`):

```
POST   /api/v1/documents          documents:write
POST   /api/v1/documents/bulk     documents:bulk
GET    /api/v1/documents/:id      documents:read
PUT    /api/v1/documents/:id      documents:write
DELETE /api/v1/documents/:id      documents:delete
GET    /api/v1/documents/search   search:read   (q, limit, dataset, tenant, bookmark, sort)
POST   /new/target/:actor         targets:dispatch (legacy)
GET    /targets/:actor            targets:read (legacy)
```

Manifest documents keep strict v0.9 `data` fields (`actor`, `consumer_path`,
`target_options`, `manifest_type`, `name`, `generated_at`, `schema_versions`);
richer runtime contracts belong to `extensions.starintel.actor_manifest.v1`
(tracked as a follow-up).

## Security notes

- starintel-server is an experimental operator system without ambient
  authentication. **LAN-only**: never point these nodes at an untrusted
  network, and never expose the server beyond your operator network.
- This palette stores no credentials. prolog-rlm credentials are referenced
  by environment variable name in the runtime config node (see the
  prolog-rlm palette).

## Schema provenance

StarIntel document consumers pin
[`schema/starintel-schema.lock.json`](https://github.com/lost-rob0t/starintel-gpt-auto-dig)
in their repositories. At the time of this palette's design the locked
release was 0.9.1 (base schema family 0.9.0). Manifest emission uses strict
v0.9 fields; full schema conformance against the locked release is a
follow-up issue.

## Install

```sh
cd ~/.node-red
npm install /path/to/node-red-prolog-rlm /path/to/node-red-starintel
```

## Nix

```sh
nix flake check
nix develop
nix build .#palette
```

## Verification

```sh
node --test
```

## License

MIT
