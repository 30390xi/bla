# One-Click Agent Defense Hardening (`bla defend` / `bla_defend`)

Once BLA is registered with your coding agent (`npx bla-agents@latest setup`), you can trigger the entire 5-stage Counter-REA defense pipeline with a single command or natural-language prompt.

## One-Click CLI Usage

```bash
npx bla-agents@latest defend ./dist/app.js --manifest
```

## One-Click Agent Prompt

After running `npx bla-agents@latest setup`, tell Claude Code, Cursor, Codex, Windsurf, Gemini CLI, or OpenCode:

```text
Run bla_defend on ./dist with bankrupt intensity and emit a defense manifest.
```

## What `bla defend` Executes Automatically

1. **Stage 1 (`inspect-release`)**: Read-only scan for accidental `.map` (`sourcesContent`) and symbol leaks.
2. **Stage 2 (`audit`)**: 16-vector REA vulnerability & Claude Opus 4 / Sonnet 4 / o3 token-cost simulation.
3. **Stage 3 (`protect --intensity bankrupt`)**: Injects both the **Resource-Exhaustion Suite** and the **Model-Misjudgment Induction Suite**.
4. **Stage 4 (`verify`)**: Verifies all Counter-REA mathematical invariants and confirms `16x–51x` token/cost bankruptcy amplification.
5. **Stage 5 (`manifest`)**: Emits `<output>.bla-manifest.json` attesting to the hardened build.
