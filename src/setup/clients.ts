import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type SupportedAgentClientId =
  | "claude_code"
  | "claude_desktop"
  | "cursor"
  | "codex"
  | "gemini_cli"
  | "windsurf"
  | "antigravity"
  | "vscode"
  | "opencode"
  | "copilot_cli";

export interface AgentClientDefinition {
  readonly id: SupportedAgentClientId;
  readonly displayName: string;
  readonly configPath: string;
  readonly skillDirectory: string;
  readonly detected: boolean;
}

export function resolveSupportedAgentClients(
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): readonly AgentClientDefinition[] {
  const claudeDesktopDir =
    platform === "darwin"
      ? join(home, "Library", "Application Support", "Claude")
      : platform === "win32"
        ? join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude")
        : join(home, ".config", "Claude");

  const vscodeDir =
    platform === "darwin"
      ? join(home, "Library", "Application Support", "Code", "User")
      : platform === "win32"
        ? join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Code", "User")
        : join(home, ".config", "Code", "User");

  const rawDefs: {
    id: SupportedAgentClientId;
    displayName: string;
    configPath: string;
    markerPath: string;
    skillDirectory: string;
  }[] = [
    {
      id: "claude_code",
      displayName: "Claude Code",
      configPath: join(home, ".claude.json"),
      markerPath: join(home, ".claude"),
      skillDirectory: join(home, ".claude", "skills", "blind-llm-agents"),
    },
    {
      id: "claude_desktop",
      displayName: "Claude Desktop",
      configPath: join(claudeDesktopDir, "claude_desktop_config.json"),
      markerPath: claudeDesktopDir,
      skillDirectory: join(home, ".agents", "skills", "blind-llm-agents"),
    },
    {
      id: "cursor",
      displayName: "Cursor",
      configPath: join(home, ".cursor", "mcp.json"),
      markerPath: join(home, ".cursor"),
      skillDirectory: join(home, ".cursor", "skills", "blind-llm-agents"),
    },
    {
      id: "codex",
      displayName: "Codex CLI",
      configPath: join(home, ".codex", "mcp.json"),
      markerPath: join(home, ".codex"),
      skillDirectory: join(home, ".codex", "skills", "blind-llm-agents"),
    },
    {
      id: "gemini_cli",
      displayName: "Gemini CLI",
      configPath: join(home, ".gemini", "settings.json"),
      markerPath: join(home, ".gemini"),
      skillDirectory: join(home, ".gemini", "skills", "blind-llm-agents"),
    },
    {
      id: "antigravity",
      displayName: "Google Antigravity",
      configPath: join(home, ".gemini", "antigravity", "mcp_config.json"),
      markerPath: join(home, ".gemini", "antigravity"),
      skillDirectory: join(home, ".gemini", "antigravity", "skills", "blind-llm-agents"),
    },
    {
      id: "windsurf",
      displayName: "Windsurf",
      configPath: join(home, ".codeium", "windsurf", "mcp_config.json"),
      markerPath: join(home, ".codeium", "windsurf"),
      skillDirectory: join(home, ".agents", "skills", "blind-llm-agents"),
    },
    {
      id: "vscode",
      displayName: "VS Code",
      configPath: join(vscodeDir, "mcp.json"),
      markerPath: vscodeDir,
      skillDirectory: join(home, ".agents", "skills", "blind-llm-agents"),
    },
    {
      id: "opencode",
      displayName: "OpenCode",
      configPath: join(home, ".config", "opencode", "opencode.json"),
      markerPath: join(home, ".config", "opencode"),
      skillDirectory: join(home, ".agents", "skills", "blind-llm-agents"),
    },
    {
      id: "copilot_cli",
      displayName: "GitHub Copilot CLI",
      configPath: join(home, ".copilot", "mcp-config.json"),
      markerPath: join(home, ".copilot"),
      skillDirectory: join(home, ".agents", "skills", "blind-llm-agents"),
    },
  ];

  return rawDefs.map((def) => ({
    id: def.id,
    displayName: def.displayName,
    configPath: def.configPath,
    skillDirectory: def.skillDirectory,
    detected: existsSync(def.markerPath) || existsSync(def.configPath) || existsSync(dirname(def.configPath)),
  }));
}
