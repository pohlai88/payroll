/**
 * Shell location breadcrumb — breadcrumb-01 structure wired to app-nav.
 */

import { Link } from "wouter";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useShellNav } from "./shell-nav-context";

function ShellBreadcrumb() {
  const { currentItem, location } = useShellNav();
  const section = currentItem?.label ?? "App";
  const isNested =
    currentItem !== null &&
    currentItem.href !== "/" &&
    location !== currentItem.href;

  return (
    <Breadcrumb className="text-brand-foreground/80">
      <BreadcrumbList className="text-brand-foreground/70 sm:gap-1.5">
        <BreadcrumbItem>
          <BreadcrumbLink
            className="text-brand-foreground/70 hover:text-brand-foreground"
            render={<Link href="/" />}
          >
            Home
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="text-brand-foreground/40" />
        <BreadcrumbItem>
          {isNested && currentItem !== null ? (
            <BreadcrumbLink
              className="text-brand-foreground/70 hover:text-brand-foreground"
              render={<Link href={currentItem.href} />}
            >
              {section}
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage className="text-brand-foreground">
              {section}
            </BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {isNested ? (
          <>
            <BreadcrumbSeparator className="text-brand-foreground/40" />
            <BreadcrumbItem>
              <BreadcrumbPage className="max-w-40 truncate text-brand-foreground">
                {location.split("/").filter(Boolean).at(-1) ?? location}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export { ShellBreadcrumb };
