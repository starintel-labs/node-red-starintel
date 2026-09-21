#!/usr/bin/env python3
"""Generate the example flow library for node-red-starintel.

Emits one JSON flow per file into examples/. Regenerate after catalog or
node changes:  python3 scripts/gen-examples.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "examples")
CATALOG = json.load(open(os.path.join(HERE, "lib", "pro-actor-catalog.json")))

os.makedirs(OUT, exist_ok=True)
written = []


def fid(prefix, n):
    return f"{prefix}-{n}"


def base_node(n, node_type, x, y, wires=None, **fields):
    d = {"id": fid(prefix, n), "type": node_type, "z": tab_id, "x": x, "y": y,
         "wires": wires or []}
    d.update(fields)
    return d


def write(name, flow):
    path = os.path.join(OUT, name + ".json")
    json.dump(flow, open(path, "w"), indent=1)
    written.append(name)


def simple(name, title, info, chain, extra_config=()):
    """chain: list of (type, label, fields); wires them 1:1 with debug tail."""
    global prefix, tab_id
    prefix = "ex-" + name.replace("-", "")
    flow = [{"id": tab_id, "type": "tab", "label": title, "disabled": False, "info": info}]
    n = 1
    nodes = []
    for i, (node_type, label, fields) in enumerate(chain):
        wires = [[fid(prefix, n + 1)]] if i < len(chain) - 1 else []
        nodes.append(base_node(n, node_type, 180 + i * 220, 120, wires,
                               name=label, **fields))
        n += 1
    flow.extend(nodes)
    flow.extend(extra_config)
    write(name, flow)


SERVER_CFG = {"type": "starintel-server", "name": "LAN starintel-server",
              "baseUrl": "http://127.0.0.1:5000", "timeoutMs": 8000}
RLM_CFG = {"type": "prolog-rlm-runtime", "name": "llm.starintel.actor",
           "swipl": "swipl", "rlmHome": "/home/unseen/Documents/Projects/prolog-rlm",
           "provider": "llm.starintel.actor", "model": "", "endpoint": "",
           "credentialEnv": "", "noCredential": False, "maxTokens": 0,
           "maxCost": "", "timeLimit": 90, "contextBytes": 8192,
           "hardTimeoutMs": 120000}

# ---- 17 pro-actor examples: options -> target dispatch -> debug ----
for actor, spec in sorted(CATALOG.items()):
    prefix = "exa" + actor.replace("-", "")
    tab_id = prefix + "-tab"
    op = spec["operations"][0] if spec["operations"] else "run"
    flow = [
        {"id": tab_id, "type": "tab", "label": f"pro-actor: {actor}",
         "disabled": False,
         "info": f"Dispatch a target to the {actor} pro-actor ({spec['actor_type']}; "
                 f"operations: {', '.join(spec['operations']) or 'n/a'}). "
                 "Inspect the catalog first, then dispatch; swap the inject payload "
                 "for your target (username, url, domain...)."},
        base_node(1, "inject", 180, 100, [["exa" + actor.replace("-", "") + "-2"]],
                  name=f"target for {actor}", props=[{"p": "payload"}],
                  repeat="", crontab="", once=False, topic="",
                  payload="alice", payloadType="str"),
        base_node(2, "starintel-target", 400, 100, [["exa" + actor.replace("-", "") + "-3"]],
                  name=f"dispatch {actor}", server="cfg-srv-x", op="dispatch",
                  actor=actor, target="", options="{}", delay=0, recurring=False),
        base_node(3, "debug", 620, 100, [], name="dispatch result", active=True,
                  tosidebar=True, console=False, complete="payload", targetType="msg"),
        dict(SERVER_CFG, id="cfg-srv-x"),
    ]
    write(f"pro-actor-{actor}", flow)

# ---- filter examples ----
FILTER_CASES = [
    ("filter-by-actor", "Filter: by actor", '[{"field":"data.actor","op":"eq","value":"bluesky"}]', ""),
    ("filter-dtype-include", "Filter: dtype include list", "", "post,account"),
    ("filter-regex-email", "Filter: regex on email", '[{"field":"data.email","op":"regex","value":"@starintel\\\\.actor$"}]', ""),
    ("filter-dedupe-sort", "Filter: dedupe + sort", "", ""),
    ("filter-exists-paging", "Filter: exists + limit", '[{"field":"data.age","op":"exists"}]', ""),
]
for name, title, rules, include in FILTER_CASES:
    prefix = "ex" + name.replace("-", "")
    tab_id = prefix + "-tab"
    dd = {"dedupeField": "data.canonical_key", "sortField": "data.date_added", "sortDir": "desc"} if "dedupe" in name else {}
    simple(name, title,
           "Advanced filtering over starintel-input results. Needs starintel-server.",
           [("starintel-input", "dataset: posts", {"server": "cfg-f", "mode": "search", "q": "dtype:post", "limit": 100, "params": "", "documentId": "", "split": False}),
            ("starintel-filter", "filter", {"rules": rules, "includeDtypes": include, "excludeDtypes": "", **dd, "limit": 25, "offset": 0}),
            ("debug", "filtered", {})],
           extra_config=[dict(SERVER_CFG, id="cfg-f")])

# ---- operations examples ----
OPS_CASES = [
    ("operation-create", "Operations: create an operation",
     ("starintel-operations", "create operation", {"op": "create", "mission": "Map the org", "status": "planned", "phases": '[{"name":"recon"},{"name":"enrich"}]', "documentId": "", "phase": "", "emit": True})),
    ("operation-status", "Operations: advance status",
     ("starintel-operations", "set status active", {"op": "set-status", "mission": "", "status": "active", "phases": "", "documentId": "REPLACE_WITH_OP_ID", "phase": "", "emit": False})),
    ("operation-phase", "Operations: append phase",
     ("starintel-operations", "add phase", {"op": "add-phase", "mission": "", "status": "", "phases": "", "documentId": "REPLACE_WITH_OP_ID", "phase": '{"name":"report"}', "emit": False})),
]
for name, title, mid in OPS_CASES:
    prefix = "ex" + name.replace("-", "")
    tab_id = prefix + "-tab"
    simple(name, title, "StarIntel operation lifecycle (dtype operation). Needs starintel-server.",
           [("inject", "go", {"props": [], "repeat": "", "crontab": "", "once": False, "topic": "", "payload": "", "payloadType": "date"}),
            mid,
            ("debug", "result", {})],
           extra_config=[dict(SERVER_CFG, id="cfg-f")])

# ---- canonical input/emit patterns ----
PATTERN_CASES = [
    ("pattern-username-pipeline", "Pattern: hunt -> enrich -> emit",
     [("starintel-input", "usernames", {"server": "cfg-f", "mode": "search", "q": "dtype:username", "limit": 25, "params": "", "documentId": "", "split": True}),
      ("starintel-emit", "emit observations", {"dtype": "observation", "bulk": False}),
      ("debug", "emitted", {})]),
    ("pattern-alert-on-breach", "Pattern: breach watch -> alert emit",
     [("starintel-input", "breaches", {"server": "cfg-f", "mode": "search", "q": "dtype:breach", "limit": 10, "params": "", "documentId": "", "split": False}),
      ("starintel-filter", "only starintel.actor domains", {"rules": '[{"field":"data.domain","op":"regex","value":"starintel"}]', "includeDtypes": "", "excludeDtypes": "", "limit": 0, "offset": 0}),
      ("starintel-emit", "emit alerts", {"dtype": "alert", "bulk": True}),
      ("debug", "alerts", {})]),
    ("pattern-manifest-board", "Pattern: manifest board UI",
     [("starintel-ui", "manifest board", {"server": "cfg-f", "path": "manifests", "title": "Actor manifests", "q": "dtype:actor-manifest", "limit": 50, "view": "cards", "columns": "", "refreshSec": 30})]),
    ("pattern-agent-reconfigure", "Pattern: agent reconfigures node-red",
     [("inject", "flows request", {"props": [], "repeat": "", "crontab": "", "once": False, "topic": "", "payload": "", "payloadType": "date"}),
      ("starintel-flow-manager", "get flows", {"op": "get-flows", "baseUrl": "http://127.0.0.1:1880", "authEnv": "", "timeoutMs": 8000}),
      ("debug", "current flows", {})]),
    ("pattern-message-to-org", "Pattern: message to Org",
     [("starintel-input", "messages", {"server": "cfg-f", "mode": "search", "q": "dtype:message", "limit": 25, "params": "", "documentId": "", "split": False}),
      ("message2org", "to org", {"headingLevel": 2, "drawer": True, "timestamps": "org", "tags": "full", "quoteLevel": 0, "separator": "\\n\\n"}),
      ("debug", "org", {})]),
    ("pattern-agentic-operation", "Pattern: agentic starintel-rlm on dataset",
     [("inject", "ask", {"props": [{"p": "payload"}], "repeat": "", "crontab": "", "once": False, "topic": "", "payload": "Which actors are advertised and what do they collect?", "payloadType": "str"}),
      ("starintel-rlm", "starintel-rlm", {"server": "cfg-f", "runtime": "cfg-r", "query": "", "contextMode": "dataset", "contextStatic": "", "datasetQ": "dtype:actor-manifest", "datasetLimit": 10, "publishManifest": False, "actorName": "playground-agent", "targetOptions": ""}),
      ("debug", "envelope", {})]),
]
for name, title, chain in PATTERN_CASES:
    prefix = "ex" + name.replace("-", "")
    tab_id = prefix + "-tab"
    cfgs = [dict(SERVER_CFG, id="cfg-f")]
    if any(c[1] == "starintel-rlm" for c in chain):
        cfgs.append(dict(RLM_CFG, id="cfg-r"))
    simple(name, title, "Canonical StarIntel document-flow pattern.", chain, extra_config=cfgs)

print(f"wrote {len(written)} examples")
for name in sorted(written):
    print(" -", name)
