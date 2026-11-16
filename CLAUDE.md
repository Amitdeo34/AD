# Standing rules

These apply to every session in this repository. They come from the
person's own preferences and from corrections they had to repeat.

## Confidentiality (overrides everything else)

- **Never name the person's employer or client.** Say "the steel plant" or
  "the site" instead. This applies in chat, files, code samples, commit
  messages and published pages alike.
- **Project data the person provides is confidential.** Never publish it: no
  hosted pages, and no Artifacts that contain it. Deliver it as files only.
  A tool may be published as an Artifact only if it holds demo data and
  nothing of theirs, and only when they ask.
- **This repository is public.** Never commit the person's project files,
  exports or real data. Tools ship with demo data. Never write personal
  details (address, people's names) into any file.

## Delivering tools and files

- A tool means **one self-contained `.html` file**. It opens by
  double-click with no install, server or internet, works at phone width,
  and keeps data in the browser. Do not build it as a route inside the web
  app unless asked.
- **Attach the file in the chat, and give its path in the first lines of
  the reply.** The person has had to ask "where is the html" many times.
- After every change, **reshare the full updated file**, not a diff.
- Extend the latest existing version (the attached file, or the newest on
  the repo's branches) rather than starting over. If you cannot find it, ask.
- **Templates and approved formats stay exactly as they are.** Fill
  placeholders and empty cells only. If something in the template cannot
  work, say so and offer the fix; do not apply it unasked.
- Put each standalone tool in its own top-level folder. Leave the hotel
  booking app (`app/`, `components/`, `lib/`) alone unless the task is about
  it.

## Working style

- Reply in the person's language mix. If they write Hinglish, answer in
  plain Hinglish and keep technical terms in English.
- Messages often pack several asks into one sentence. Number them, do each
  one, and report each as done or not done.
- Ask only what truly blocks the work. Otherwise decide, and state the
  assumption in the reply.
- On long builds, save a working version between stages, so a usage limit
  mid-build does not lose everything.
- Push code only to the session's own branch. Do not open pull requests or
  merge into `main` unless asked.

## Specialist agents

`.claude/agents/` holds agents for the person's recurring work: P6-style
scheduling tools, drawing/BIM-to-4D tools, DPR and PMO report engines,
monthly progress workbooks, and Indian-language tools. Hand matching work to
them. `/make-agents` reads newer activity and refreshes them.
