import type { PluginClientContext } from "@getpaseo/plugin/client";
import { MainSurface } from "./client/main";
import { ConnectionSettingsScreen } from "./client/settings";

// addSurface/addSidebarItem are deprecated in Paseo 0.13 but are the sidebar API that every
// release from 0.9.2 understands. Move to addScreen/addSidebarHeaderItem when 0.13 is the floor.
export default function contribute(client: PluginClientContext) {
  client.addSurface("main", MainSurface);
  client.addSidebarItem({
    id: "server-load",
    title: "Server Load",
    icon: "Activity",
    surface: "main",
  });
  client.addCommandCenterItem({
    id: "open-server-load",
    title: "Open Server Load",
    icon: "Activity",
    context: "global",
    onSelect({ openSurface }) {
      openSurface("main");
    },
  });
  client.addSettingsScreen({
    id: "connection",
    title: "Server Load",
    icon: "Activity",
    Component: ConnectionSettingsScreen,
  });
  return () => {};
}
