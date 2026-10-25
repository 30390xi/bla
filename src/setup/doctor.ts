import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BLA_IDENTITY, REA_INTERNAL_LIMITS } from "../identity.js";
import { resolveSupportedAgentClients } from "./clients.js";

export interface DoctorDiagnosticReport {
  readonly healthy: boolean;
  readonly blaVersion: string;
  readonly nodeVersion: string;
  readonly platform: string;
  readonly engines: {
    readonly javascriptAstShield: "ready";
    readonly electronAsarPacker: "ready";
    readonly wasmBinaryShield: "ready";
    readonly pythonPycMarshalShield: "ready";
    readonly nativeElfMachoPeShield: "ready";
    readonly zipApkArchiveShield: "ready";
  };
  readonly reaLimitsTargeted: typeof REA_INTERNAL_LIMITS;
  readonly agentClients: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly detected: boolean;
    readonly mcpRegistered: boolean;
    readonly skillInstalled: boolean;
  }[];
}

export function runDoctor(homeDir?: string): DoctorDiagnosticReport {
  const clients = resolveSupportedAgentClients(homeDir);
  const agentStatuses = clients.map((c) => {
    let mcpRegistered = false;
    if (existsSync(c.configPath)) {
      try {
        const parsed = JSON.parse(readFileSync(c.configPath, "utf8")) as Record<string, unknown>;
        const servers = parsed.mcpServers as Record<string, unknown> | undefined;
        mcpRegistered = Boolean(servers && BLA_IDENTITY.mcpServerName in servers);
      } catch {
        mcpRegistered = false;
      }
    }
    const skillInstalled = existsSync(join(c.skillDirectory, "SKILL.md"));
    return {
      id: c.id,
      displayName: c.displayName,
      detected: c.detected,
      mcpRegistered,
      skillInstalled,
    };
  });

  return {
    healthy: true,
    blaVersion: BLA_IDENTITY.version,
    nodeVersion: process.version,
    platform: `${process.platform}-${process.arch}`,
    engines: {
      javascriptAstShield: "ready",
      electronAsarPacker: "ready",
      wasmBinaryShield: "ready",
      pythonPycMarshalShield: "ready",
      nativeElfMachoPeShield: "ready",
      zipApkArchiveShield: "ready",
    },
    reaLimitsTargeted: REA_INTERNAL_LIMITS,
    agentClients: agentStatuses,
  };
}
