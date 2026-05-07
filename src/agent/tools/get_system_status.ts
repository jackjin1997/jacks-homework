import { tool } from "@langchain/core/tools";
import { Command } from "@langchain/langgraph";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { DATA_DIR } from "@/lib/paths";

type ServiceStatus = {
  status?: string;
};

type ActiveIncident = {
  service?: string;
};

type SystemStatus = {
  services?: Record<string, ServiceStatus>;
  active_incidents?: ActiveIncident[];
};

export const makeGetSystemStatusTool = () => tool(
  async ({ service }, config) => {
    const status = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "system_status.json"), "utf-8")) as SystemStatus;
    let summary: string;
    let excerpt: string;

    if (!service) {
      summary = JSON.stringify(status);
      excerpt = `services: ${Object.keys(status.services || {}).join(",")}, active_incidents: ${(status.active_incidents || []).length}`;
    } else {
      const svc = status.services?.[service];
      const incidents = (status.active_incidents ?? []).filter((incident) => incident.service === service);
      summary = JSON.stringify({ service, status: svc ?? "unknown", active_incidents: incidents });
      excerpt = `${service}: ${svc?.status ?? "unknown"}, incidents=${incidents.length}`;
    }

    return new Command({
      update: {
        evidenceCollected: [{
          source: "data/system_status.json",
          excerpt,
          timestamp: new Date().toISOString(),
          tool: "get_system_status",
        }],
        messages: [{ role: "tool", content: summary, tool_call_id: config?.toolCall?.id ?? "get_system_status" }],
      },
    });
  },
  {
    name: "get_system_status",
    description: "Get current health + active incidents. Pass a service name (e.g. 'vpn_gateway_us', 'okta') for filtered view, or omit to get full snapshot.",
    schema: z.object({ service: z.string().optional() }),
  },
);

export const getSystemStatusTool = makeGetSystemStatusTool();
