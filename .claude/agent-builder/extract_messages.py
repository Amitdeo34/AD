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

  3. A claude.ai data export (Settings → Privacy → Export data): the
     unzipped folder, or its conversations.json / projects.json. This is
     the only way to see claude.ai chats, Projects and Cowork chats.

Usage:
  python3 -I extract_messages.py FILE [FILE ...] [--max-chars N]
  python3 -I extract_messages.py --export PATH            # list chats + Projects
  python3 -I extract_messages.py --export PATH --chat TXT # typed messages of the
                                                          # chats whose name or id
                                                          # contains TXT

For `list_events` results the paging cursors are printed at the end, so the
caller knows whether older pages remain (has_more) and which id to pass as
`before_id` next.
"""

import os

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


def clip(text, n):
    text = (text or "").strip()
    return text if len(text) <= n else text[:n] + f" …[+{len(text) - n} chars]"


def export_files(path):
    if os.path.isfile(path):
        return [path]
    found = []
    for root, _dirs, files in os.walk(path):
        for name in files:
            if name in ("conversations.json", "projects.json"):
                found.append(os.path.join(root, name))
    return sorted(found)


def chat_text(msg):
    text = msg.get("text")
    if not text:
        text = human_text(msg.get("content")) or ""
    return text.strip()


def show_export(path, chat_filter, max_chars):
    files = export_files(path)
    if not files:
        print(f"No conversations.json or projects.json under {path}")
        return 1
    for f in files:
        with open(f, encoding="utf-8", errors="replace") as fh:
            data = json.load(fh)
        if not isinstance(data, list):
            data = data.get("data", []) if isinstance(data, dict) else []
        if f.endswith("projects.json"):
            print(f"=== {f}: {len(data)} Project(s)")
            for p in data:
                docs = [d.get("filename", "?") for d in p.get("docs") or []]
                print(f"--- PROJECT {p.get('name', '?')} | created {p.get('created_at', '')[:10]}"
                      f" | updated {p.get('updated_at', '')[:10]} | {len(docs)} doc(s)")
                if p.get("description"):
                    print("description: " + clip(p["description"], max_chars))
                if p.get("prompt_template"):
                    print("instructions: " + clip(p["prompt_template"], max_chars))
                if docs:
                    print("docs: " + ", ".join(docs[:20]))
            continue
        chats = data
        if chat_filter:
            needle = chat_filter.lower()
            chats = [c for c in chats
                     if needle in (c.get("name") or "").lower() or needle in (c.get("uuid") or "")]
        chats.sort(key=lambda c: c.get("updated_at") or "", reverse=True)
        print(f"=== {f}: {len(chats)} chat(s)" + (f" matching '{chat_filter}'" if chat_filter else ""))
        for c in chats:
            msgs = c.get("chat_messages") or []
            human = [m for m in msgs if m.get("sender") == "human"]
            print(f"--- CHAT {c.get('name') or '(untitled)'} | id {c.get('uuid', '')}"
                  f" | {c.get('created_at', '')[:10]} → {c.get('updated_at', '')[:10]}"
                  f" | {len(human)} typed message(s)")
            if not chat_filter:
                if human:
                    print("first ask: " + clip(chat_text(human[0]), 300))
                continue
            for m in human:
                text = chat_text(m)
                if text:
                    print(f"[{m.get('created_at', '')}] {clip(text, max_chars)}")
    return 0


def main(argv):
    max_chars = 1500
    paths = []
    export = chat_filter = None
    it = iter(argv)
    for a in it:
        if a == "--max-chars":
            max_chars = int(next(it))
        elif a == "--export":
            export = next(it)
        elif a == "--chat":
            chat_filter = next(it)
        else:
            paths.append(a)
    if export:
        return show_export(export, chat_filter, max_chars)
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
