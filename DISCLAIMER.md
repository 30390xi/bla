# Legal & Technical Disclaimer

**BLA (`bla-agents` — Blind LLM Agents)** is a defensive software engineering and intellectual-property protection tool designed for software authors, independent developers, and security researchers to protect their own first-party software artifacts against automated AI reverse-engineering pipelines.

## 1. Defensive & Benign Operation Only

All artifacts generated or modified by BLA contain strictly benign, inert software-protection structures:
- Number-theoretic opaque predicates ($O(1)$ arithmetic invariants at runtime)
- Inert synthetic state-machine functions and decoy cross-references
- Decoy architectural metadata (such as simulated TEE/SGX enclave delegation manifests, honey VLQ source maps, and synthetic compiler commit strings)

BLA **never** injects destructive commands, shell payloads, network callbacks, or exploitative code into protected binaries or scripts.

## 2. Authorized Use

You may only run `bla-shield` on software, bundles, and binaries that you own or have explicit authorization to modify and distribute. Always verify protected artifacts in your staging environment (`bla verify <original> <protected>`) before shipping to production.

## 3. Defense-in-Depth

While BLA deterministically trips the static, semantic, and metadata resource caps of automated reverse-engineering agents (such as REA), no client-side protection scheme can guarantee absolute mathematical secrecy against a dedicated human analyst with unlimited time and hardware debugging access. Always keep high-value secrets (such as private API keys or master signing keys) on trusted server infrastructure.
