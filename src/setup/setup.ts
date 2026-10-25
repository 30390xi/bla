import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BLA_IDENTITY } from "../identity.js";
import {
  resolveSupportedAgentClients,
  type AgentClientDefinition,
  type SupportedAgentClientId,
} from "./clients.js";

export interface PlannedSetupAction {
  readonly clientId: SupportedAgentClientId;
  readonly displayName: string;
  readonly configPath: string;
  readonly backupPath: string | null;
  readonly skillPath: string;
  readonly mcpCommand: string;
  readonly mcpArgs: readonly string[];
}

export interface SetupRunOptions {
  readonly clientIds?: readonly SupportedAgentClientId[];
  readonly allDetected?: boolean;
  readonly dryRun?: boolean;
  readonly yes?: boolean;
  readonly homeDir?: string;
}

export interface SetupRunResult {
  readonly status: "planned" | "applied";
  readonly actions: readonly PlannedSetupAction[];
  readonly message: string;
}

function resolveBundledSkillContent(): string {
  try {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const candidate = resolve(thisDir, "../../.agents/skills/blind-llm-agents/SKILL.md");
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf8");
    }
  } catch {
    // Fallback inline skill
  }
  return [
    "---",
    "name: blind-llm-agents",
    "description: Audit, protect, and verify software artifacts (JavaScript/TypeScript, Electron ASAR, WebAssembly, Python, and Native Binaries) against AI reverse-engineering agents like REA using BLA.",
    "---",
    "",
    "# BLA: Blind LLM Agents (Counter-REA Defense Shield)",
    "",
    "Use BLA (`bla_audit`, `bla_protect`, `bla_verify`, `bla_benchmark`, `bla_emit_headers`) whenever the user wants to:",
    "1. Audit how exposed an application, bundle, ASAR, WASM, Python `.pyc`, or native binary is to AI reverse-engineering tools (`rea`).",
    "2. Protect build artifacts before release by injecting Algorithmic Tarpits, REA Semantic Budget Breakers, Electron IPC Ambiguity, Honey Source Maps, and Architectural Chaff.",
    "3. Verify defense effectiveness and calculate attacker Token & Cost Amplification.",
  ].join("\n");
}

export function runSetup(options: SetupRunOptions = {}): SetupRunResult {
  const allClients = resolveSupportedAgentClients(options.homeDir);
  let selected: AgentClientDefinition[];

  if (options.clientIds && options.clientIds.length > 0) {
    const set = new Set(options.clientIds);
    selected = allClients.filter((c) => set.has(c.id));
  } else if (options.allDetected) {
    selected = allClients.filter((c) => c.detected);
  } else {
    selected = allClients.filter((c) => c.detected);
    if (selected.length === 0) {
      selected = allClients.filter((c) => c.id === "claude_code" || c.id === "cursor");
    }
  }

  const actions: PlannedSetupAction[] = selected.map((c) => ({
    clientId: c.id,
    displayName: c.displayName,
    configPath: c.configPath,
    backupPath: existsSync(c.configPath) ? `${c.configPath}.bla-backup` : null,
    skillPath: join(c.skillDirectory, "SKILL.md"),
    mcpCommand: "npx",
    mcpArgs: ["-y", `${BLA_IDENTITY.packageName}@latest`, "mcp"],
  }));

  if (options.dryRun || !options.yes) {
    return {
      status: "planned",
      actions,
      message: options.dryRun
        ? `Dry-run complete: ${actions.length} agent client(s) planned. Run with --yes to apply.`
        : `Planned setup for ${actions.length} detected agent client(s). Pass --yes to write MCP registrations and skills.`,
    };
  }

  const skillContent = resolveBundledSkillContent();

  for (const action of actions) {
    mkdirSync(dirname(action.configPath), { recursive: true });
    let existingConfig: Record<string, unknown> = {};
    if (existsSync(action.configPath)) {
      if (action.backupPath) {
        copyFileSync(action.configPath, action.backupPath);
      }
      try {
        existingConfig = JSON.parse(readFileSync(action.configPath, "utf8")) as Record<string, unknown>;
      } catch {
        existingConfig = {};
      }
    }

    const mcpServers =
      typeof existingConfig.mcpServers === "object" && existingConfig.mcpServers !== null
        ? { ...(existingConfig.mcpServers as Record<string, unknown>) }
        : {};

    mcpServers[BLA_IDENTITY.mcpServerName] = {
      command: action.mcpCommand,
      args: [...action.mcpArgs],
    };

    existingConfig.mcpServers = mcpServers;
    writeFileSync(action.configPath, JSON.stringify(existingConfig, null, 2) + "\n", "utf8");

    mkdirSync(dirname(action.skillPath), { recursive: true });
    writeFileSync(action.skillPath, skillContent, "utf8");
  }

  return {
    status: "applied",
    actions,
    message: `Configured BLA MCP server and skill for ${actions.length} agent client(s). Restart your agent to load BLA tools.`,
  };
}

export function runUninstall(options: { readonly homeDir?: string } = {}): {
  readonly removedClients: readonly string[];
} {
  const allClients = resolveSupportedAgentClients(options.homeDir);
  const removed: string[] = [];

  for (const client of allClients) {
    if (existsSync(client.configPath)) {
      try {
        const parsed = JSON.parse(readFileSync(client.configPath, "utf8")) as Record<string, unknown>;
        if (
          typeof parsed.mcpServers === "object" &&
          parsed.mcpServers !== null &&
          BLA_IDENTITY.mcpServerName in (parsed.mcpServers as Record<string, unknown>)
        ) {
          delete (parsed.mcpServers as Record<string, unknown>)[BLA_IDENTITY.mcpServerName];
          writeFileSync(client.configPath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
          removed.push(client.id);
        }
      } catch {
        // Ignore malformed
      }
    }
    if (existsSync(client.skillDirectory)) {
      rmSync(client.skillDirectory, { recursive: true, force: true });
    }
  }

  return { removedClients: removed };
}
