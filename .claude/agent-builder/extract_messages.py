#!/usr/bin/env python3
"""Pull the messages a person actually typed out of Claude transcript data.

Two kinds of input are understood:

  1. A saved result of the `list_events` tool (claude-code-remote MCP server),
     i.e. the text the tool returned, which wraps a JSON object
     {"ccr": {"data": [...], "has_more": ..., "first_id": ..., ...}}.
  2. A local Claude Code transcript, one JSON object per line
     (~/.claude/projects/<project>/<session>.jsonl).

Tool results, image placeholders, system reminders and other machine-written
turns are dropped, so what is left is the person's own requests and
corrections. Output is plain text, one message per block, oldest first.

Usage:
  python3 -I extract_messages.py FILE [FILE ...] [--max-chars N]

For `list_events` results the paging cursors are printed at the end, so the
caller knows whether older pages remain (has_more) and which id to pass as
`before_id` next.
"""

import json
import sys

SKIP_PREFIXES = (
    "[Image:",
    "<system-reminder>",
    "<command-name>",
    "<local-command",
    "Caveat:",
    "[Request interrupted",
    "<task-notification",
    "<webhook-payload",
    "<wake ",
    "<child-session-event",
)


def human_text(content):
    """Return the human-typed text in a message `content`, or None."""
    if isinstance(content, str):
        parts = [content]
    elif isinstance(content, list):
        if any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content):
            return None
        parts = [b.get("text", "") for b in content
                 if isinstance(b, dict) and b.get("type") == "text"]
    else:
        return None
    parts = [p.strip() for p in parts if p and p.strip()]
    parts = [p for p in parts if not p.startswith(SKIP_PREFIXES)]
    text = "\n".join(parts).strip()
    return text or None


def from_list_events(obj):
    ccr = obj.get("ccr", obj)
    out = []
    for ev in ccr.get("data", []):
        res = ev.get("result")
        if isinstance(res, dict):
            # One per finished turn: which typed message(s) started it, and
            # Claude's closing reply. Fetch the typed message with get_event.
            inner = res.get("internal_anthropic_catchall", res)
            origin = (inner.get("origin") or {}).get("kind", "?")
            ids = ", ".join(inner.get("user_message_uuids") or [])
            reply = (inner.get("result") or "").strip()
            out.append((ev.get("created_at", ""),
                        f"[turn result; origin={origin}; user_message_uuids={ids}]\n{reply}"))
            continue
        user = ev.get("user")
        if not isinstance(user, dict):
            continue
        inner = user.get("internal_anthropic_catchall", user)
        if inner.get("parent_tool_use_id"):
            continue  # a subagent's prompt, not the person
        msg = inner.get("message", {})
        text = human_text(msg.get("content"))
        if text:
            out.append((ev.get("created_at", ""), text))
    cursors = {k: ccr.get(k) for k in ("has_more", "first_id", "last_id")}
    return out, cursors


def from_jsonl(lines):
    out = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except ValueError:
            continue
        if rec.get("type") != "user" or rec.get("isMeta") or rec.get("isSidechain"):
            continue
        text = human_text(rec.get("message", {}).get("content"))
        if text:
            out.append((rec.get("timestamp", ""), text))
    return out, None


def load(path):
    with open(path, encoding="utf-8", errors="replace") as fh:
        raw = fh.read()
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end > start:
        try:
            obj = json.loads(raw[start:end + 1])
            if isinstance(obj, dict) and ("ccr" in obj or "data" in obj):
                return from_list_events(obj)
        except ValueError:
            pass
    return from_jsonl(raw.splitlines())


def main(argv):
    max_chars = 1500
    paths = []
    it = iter(argv)
    for a in it:
        if a == "--max-chars":
            max_chars = int(next(it))
        else:
            paths.append(a)
    if not paths:
        print(__doc__)
        return 2
    for path in paths:
        msgs, cursors = load(path)
        msgs.sort(key=lambda m: m[0])
        print(f"=== {path}: {len(msgs)} typed message(s)")
        for ts, text in msgs:
            if len(text) > max_chars:
                text = text[:max_chars] + f" …[+{len(text) - max_chars} chars]"
            print(f"--- {ts}\n{text}")
        if cursors:
            print(f"=== cursors: {json.dumps(cursors)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
