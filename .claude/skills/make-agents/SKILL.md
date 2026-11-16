---
name: make-agents
description: Read the person's Claude activity and create or update specialised subagents for the work they repeat, then save them to the repository. Use when the person types /make-agents or asks to make, refresh or suggest agents based on what they have been doing.
---

# Make agents from my activity

1. Run the **agent-builder** subagent (Agent tool, `subagent_type: "agent-builder"`).
   Pass any extra wishes from the person along in the prompt: $ARGUMENTS

   If `agent-builder` is not offered as an agent type in this session (agent
   types load when a session starts), launch a `general-purpose` agent with the
   prompt: "Read `.claude/agents/agent-builder.md` and follow its instructions
   exactly, as if it were your system prompt." Add the person's wishes to that
   prompt.

2. When it returns, give the person its table of agents created and updated,
   the candidates it skipped, and what it could not read. Keep it short.

3. Save the work. Commit `.claude/agents/` and `.claude/agent-builder/` on the
   current branch, then push that branch. In a cloud session the container is
   discarded when the session ends, so unpushed agents are lost.

4. Tell the person, in one line, that new agents load in sessions started
   from a branch that contains them. To have them in every new session, merge
   the branch into the default branch.
