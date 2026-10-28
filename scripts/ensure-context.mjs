// GARY — `tauri dev` prerequisite. tauri.conf.json declares the `context` resource, which only
// scripts/bundle-context.mjs stages (at `tauri build`). On a fresh clone the dir is absent and the Rust
// build aborts with "resource path `context` doesn't exist". Create an EMPTY placeholder (no `.claude/`)
// so dev compiles; workspace::bootstrap ignores a context without `.claude/` → dev keeps repo-root behavior.
// A real staged context (from a previous build) is left untouched.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

mkdirSync(join(process.cwd(), 'src-tauri', 'context'), { recursive: true });
