/**
 * @feature shell
 * @layer ui
 *
 * Shell menu trigger.
 */

import type { VariantProps } from "class-variance-authority";
import { PanelLeftCloseIcon, PanelRightCloseIcon } from "lucide-react";
import type { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

interface Props {
  className?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
}

const MenuTrigger = ({ className, variant = "ghost" }: Props) => {
  const { open, isMobile, openMobile, toggleSidebar } = useSidebar();

  const isOpen = isMobile ? openMobile : open;

  return (
    <Button
      className={className}
      onClick={toggleSidebar}
      size="icon-lg"
      variant={variant}
    >
      {isOpen ? <PanelLeftCloseIcon /> : <PanelRightCloseIcon />}
    </Button>
  );
};

export default MenuTrigger;
