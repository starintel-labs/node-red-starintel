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

New document writes use flat lowerCamelCase StarIntel 0.10.1 objects. Manifest
runtime metadata lives in `metadata`; consumer paths and target options use
`consumerPaths` and `targetOptions`. Operations and alerts have no matching core
dtype and are explicitly stored as `document.extensions.nodeRed.operation` or
`document.extensions.nodeRed.alert`. Legacy operation updates fail closed.

## Security notes

- starintel-server is an experimental operator system without ambient
  authentication. **LAN-only**: never point these nodes at an untrusted
  network, and never expose the server beyond your operator network.
- This palette stores no credentials. prolog-rlm credentials are referenced
  by environment variable name in the runtime config node (see the
  prolog-rlm palette).

## Schema provenance

The immutable StarLang release at `765f1673851192bcaf1cdd2f35c47608f979b079`
is pinned in `schema/starintel-schema.lock.json`. Vendored generated artifacts
come exclusively from `specs/starintel/0.10.1`; check them offline with:

```sh
python3 scripts/sync-starintel-consumer.py --offline
```

All emit/document write boundaries validate the concrete dtype against that
schema. Historical 0.9 envelopes remain readable, but must be migrated by the
upstream migration tooling before writing. This palette never silently flattens
or relabels historical records. Raw emit input must contain canonical fields;
unknown payloads can be preserved explicitly in the `extensions` object of a
`document`. No stored database is rewritten.

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
