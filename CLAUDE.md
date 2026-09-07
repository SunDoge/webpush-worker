# Project workflow

Use Node.js 26 and pnpm 12 for this workspace.

- Install dependencies with `pnpm install`.
- Run package scripts with `pnpm run <script>`.
- Run workspace scripts with `pnpm --filter <package> run <script>`.
- Run package binaries with `pnpm exec <binary>`.
- Prefer Node.js built-in APIs over runtime-specific APIs.
- Use `better-sqlite3` for local SQLite tooling. Production data is stored in Cloudflare D1.

The workspace packages are declared in `pnpm-workspace.yaml`. The API is a Cloudflare Worker,
and the PWA is built with Vite and Svelte.
