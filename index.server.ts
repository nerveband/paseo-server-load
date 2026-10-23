import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createHandlers } from "./server/pressure";
import {
  connectionSettings,
  getArchivedAgents,
  getPressureStatus,
  restoreArchivedAgent,
  setPressureFeatures,
} from "./shared/pressure";

export default function contribute(server: PluginServerContext) {
  const handlers = createHandlers(server.registerSettings(connectionSettings));
  server.handle(getPressureStatus, handlers.status);
  server.handle(setPressureFeatures, handlers.set);
  server.handle(getArchivedAgents, handlers.archived);
  server.handle(restoreArchivedAgent, handlers.restore);
  return () => {};
}
