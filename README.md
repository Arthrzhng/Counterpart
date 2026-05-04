# Counterpart

An adaptive AI chat application built with Next.js, Tailwind CSS, and the Anthropic Claude API.

## Setup

1. `npm install`
2. Create `.env.local` in the root with: `ANTHROPIC_API_KEY=your_key_here`
3. `npm run dev`
4. To deploy: `npx vercel` (add `ANTHROPIC_API_KEY` as environment variable in Vercel dashboard)

The app defaults to `claude-sonnet-4-6`. To use another supported Anthropic model, set `ANTHROPIC_MODEL` in `.env.local`.
