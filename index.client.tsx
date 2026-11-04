import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { MainSurface } from "./client/main";
import { ConnectionSettingsScreen } from "./client/settings";

function ServerLoadItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Activity"
      active={currentScreen?.screenId === "main"}
      onPress={() => openScreen({ screenId: "main" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "main", title: "Server Load", Component: MainSurface });
  client.addSidebarHeaderItem({
    id: "server-load",
    title: "Server Load",
    Component: ServerLoadItem,
  });
  client.addCommandCenterItem({
    id: "open-server-load",
    title: "Open Server Load",
    icon: "Activity",
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "main" });
    },
  });
  client.addCommandCenterItem({
    id: "server-load-settings",
    title: "Server Load settings: add or edit machines",
    icon: "Activity",
    context: "global",
    onSelect({ openSettings }) {
      openSettings("connection");
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
