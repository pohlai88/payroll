"use client";

import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface Workspace {
  name: string;
  image: string;
  workspace: string;
}

const workspaces: Workspace[] = [
  {
    name: "shadcn/studio",
    image:
      "https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dropdown/icon-16.png",
    workspace: "Workspace",
  },
  {
    name: "FlyonUI",
    image:
      "https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dropdown/icon-15.png",
    workspace: "Workspace",
  },
  {
    name: "ThemeSelection",
    image:
      "https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dropdown/icon-17.png",
    workspace: "Workspace",
  },
  {
    name: "Pixinvent",
    image:
      "https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/dropdown/icon-18.png",
    workspace: "Workspace",
  },
];

function WorkspaceMenuItem({
  activeWorkspaceName,
  workspace,
  onSelect,
}: {
  activeWorkspaceName: string;
  workspace: Workspace;
  onSelect: (workspace: Workspace) => void;
}) {
  const handleCheckedChange = useCallback(() => {
    onSelect(workspace);
  }, [onSelect, workspace]);

  return (
    <DropdownMenuCheckboxItem
      checked={activeWorkspaceName === workspace.name}
      className="gap-4 px-4 py-2.5 [&>span]:hidden"
      key={workspace.name}
      onCheckedChange={handleCheckedChange}
    >
      <img
        alt={workspace.name}
        className="size-9.5"
        height={38}
        src={workspace.image}
        width={38}
      />
      <div className="flex flex-col items-start">
        <span className="font-medium text-base">{workspace.name}</span>
        <span className="text-muted-foreground! text-sm">
          {workspace.workspace}
        </span>
      </div>
    </DropdownMenuCheckboxItem>
  );
}

const WorkspaceSwitcher = () => {
  const { isMobile } = useSidebar();
  const [activeWorkspace, setActiveWorkspace] = useState(workspaces[0]);

  if (!activeWorkspace) {
    return null;
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                size="lg"
              />
            }
          >
            <img
              alt={activeWorkspace.name}
              className="size-8"
              height={32}
              src={activeWorkspace.image}
              width={32}
            />
            <div className="flex flex-col items-start">
              <span className="font-medium text-sm">
                {activeWorkspace.name}
              </span>
              <span className="font-light text-xs">
                {activeWorkspace.workspace}
              </span>
            </div>
            <ChevronRightIcon className="ml-auto size-4 transition-transform duration-200 max-lg:rotate-90 [[data-popup-open]>&]:rotate-270 lg:[[data-popup-open]>&]:rotate-180" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56"
            side={isMobile ? "bottom" : "right"}
            sideOffset={isMobile ? 8 : 16}
          >
            {workspaces.map((workspace) => (
              <WorkspaceMenuItem
                activeWorkspaceName={activeWorkspace.name}
                key={workspace.name}
                onSelect={setActiveWorkspace}
                workspace={workspace}
              />
            ))}
            <DropdownMenuItem className="mt-1 justify-center bg-primary/10 text-primary">
              <span>Add New Workspace</span>
              <PlusIcon className="text-primary" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

export default WorkspaceSwitcher;
