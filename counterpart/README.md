# Counterpart Repo Bundle

Drop-in starter for your Counterpart project repository. Contains:

- `docs/` — your project docs converted to markdown so Claude Code can actually read them
- `.claude/skills/` — eight skills that enforce alignment with the docs

## Install (one-time)

From the root of your Counterpart repo:

```bash
# Unzip this bundle into your repo root
unzip counterpart-repo-bundle.zip

# This creates two folders at the repo root:
#   docs/
#   .claude/

# Commit them
git add docs/ .claude/
git commit -m "Add project docs and Claude Code skills"
git push
```

That's it. Claude Code will auto-detect the skills the next time you open the repo.

## Folder structure after install

```
your-counterpart-repo/
├── docs/
│   ├── principles.md              ← read-first doc; why the product exists
│   ├── personalization.md         ← MVP architecture (memory + summary)
│   ├── data-collection.md         ← every table, column, signal
│   ├── classifier-plan.md         ← Phase 2 destination architecture
│   ├── classifier-prompts.md      ← Phase 2 prompts
│   ├── branding.md                ← positioning, voice, GTM
│   └── day-by-day-plan.xlsx       ← week-by-week tasks (kept as xlsx)
├── .claude/
│   └── skills/
│       ├── product-brain/         ← anchor; load every session
│       ├── engineering-rules/     ← schema/logging/summarization
│       ├── promptsmith/           ← prompt iteration discipline
│       ├── execution-coach/       ← scope guard, forcing questions
│       ├── privacy-guard/         ← non-negotiable privacy rules
│       ├── founder-voice/         ← writing voice for content
│       ├── cost-monitor/          ← API budget protection
│       └── demo-producer/         ← 30-second comparison clips
└── (your code goes here)
```

## How the skills find the docs

Each skill references the `docs/` files by relative path (e.g. `docs/principles.md`). When Claude Code runs in your repo, it can read those files directly. So when a skill says:

> "Reference docs/principles.md §4.3 for the privacy rules."

Claude Code will actually open and quote that section. Without the docs in the repo, the skills are just rules-of-thumb. With them, they're grounded in your actual writing.

## Editing the docs

The `.md` files are now your source of truth. Edit them directly in your repo. The `.docx` originals are archived (or you can delete them — the .md versions have the same content).

When you change a doc:
- Commit the change
- The skills will pick up the new content next session (no skill update needed unless you've added/removed sections that the skills reference by section number)

If you significantly restructure a doc (renumber sections, add/remove major sections), check the relevant skill files — section references like "§4.3" might need updating.

## Running with Claude Code (recommended)

```bash
# In Codespaces or local VS Code with Claude Code extension
# Just open the repo. Skills auto-load.

# Verify by asking Claude:
"Which skills do you have loaded for this project?"

# Or kick off the day:
"Using the execution-coach skill, what should I build today?"
```

## Running with Claude.ai (alternative)

If you don't have Claude Code yet:

1. Create a Project in Claude.ai
2. Upload the `docs/*.md` files as project documents
3. Paste the relevant `SKILL.md` content into the project's custom instructions, OR attach the SKILL.md files themselves
4. Reference the skill name when asking ("Following the execution-coach skill, ...")

Less seamless than Claude Code but functional for planning/writing tasks.

## Maintenance

Update skills when:
- Database schema changes → update `engineering-rules`
- Privacy posture changes → update `privacy-guard`
- You start Phase 2 work → update `product-brain` and `execution-coach`
- Brand voice evolves → update `founder-voice`
- Anthropic pricing changes → update `cost-monitor`

If you find yourself repeatedly explaining the same workflow to Claude, that's a candidate for a new skill.

## Skills not included (deferred)

- **Alpha user feedback synthesizer** — write when you have first 10–50 users
- **Metrics & SQL** — write when you have users to query about

Both are easy to add later when they become useful.
