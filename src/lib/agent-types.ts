/**
 * Minimal agent surface used by route handlers.
 *
 * Routes touch `getState` / `updateState` / `invoke` / `stream` directly via
 * LangGraph's checkpoint API; createAgent's full type doesn't expose these
 * at the right shape, so we declare the runtime contract here.
 */
export type RouteAgent = {
  getState: (cfg: object) => Promise<{
    tasks?: { interrupts?: unknown[] }[];
    values?: Record<string, unknown>;
  }>;
  updateState: (cfg: object, vals: object) => Promise<void>;
  invoke: (input: unknown, cfg: object) => Promise<unknown>;
  stream: (input: unknown, cfg: object) => Promise<AsyncIterable<unknown>>;
};

/** Cast result of `buildAgent(...)` to the route-facing surface. */
export function asRouteAgent(agent: unknown): RouteAgent {
  return agent as RouteAgent;
}
