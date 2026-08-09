/**
 * @feature shell
 * @layer ui
 *
 * Payment history widget.
 */

import { EllipsisVerticalIcon } from "lucide-react";
import { useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface PaymentHistoryRow {
  id: string;
  primary: string;
  secondary: string;
  meta: string;
  value: string;
  subValue?: string;
  onClick?: () => void;
}

export interface PaymentHistoryMenuItem {
  label: string;
  href?: string;
  onSelect?: () => void;
}

interface Props {
  title: string;
  paymentData: PaymentHistoryRow[];
  columns?: {
    lead?: string;
    meta?: string;
    value?: string;
  };
  menuItems?: PaymentHistoryMenuItem[];
  emptyMessage?: string;
  className?: string;
}

function HistoryMenuItem({
  item,
  navigate,
}: {
  item: PaymentHistoryMenuItem;
  navigate: (href: string) => void;
}) {
  const handleClick = useCallback(() => {
    item.onSelect?.();
    if (item.href) {
      navigate(item.href);
    }
  }, [item, navigate]);

  return (
    <DropdownMenuItem onClick={handleClick}>{item.label}</DropdownMenuItem>
  );
}

const PaymentHistoryCard = ({
  title,
  paymentData,
  columns = {
    lead: "Pay run",
    meta: "Period",
    value: "Employees",
  },
  menuItems = [],
  emptyMessage = "No pay runs for this scope.",
  className,
}: Props) => {
  const [, navigate] = useLocation();

  return (
    <Card className={cn("justify-between", className)}>
      <CardHeader className="flex items-center justify-between px-6">
        <span className="font-semibold text-lg">{title}</span>
        {menuItems.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  className="size-6 rounded-full text-muted-foreground"
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <EllipsisVerticalIcon />
              <span className="sr-only">Menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {menuItems.map((item) => (
                  <HistoryMenuItem
                    item={item}
                    key={item.label}
                    navigate={navigate}
                  />
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </CardHeader>
      <CardContent className="px-0">
        {paymentData.length === 0 ? (
          <p className="px-6 text-muted-foreground text-sm">{emptyMessage}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">{columns.lead}</TableHead>
                <TableHead>{columns.meta}</TableHead>
                <TableHead className="pr-6 text-end">{columns.value}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentData.map((payment) => (
                <TableRow
                  className={cn(
                    "border-none",
                    payment.onClick
                      ? "cursor-pointer hover:bg-muted/50"
                      : "hover:bg-transparent"
                  )}
                  key={payment.id}
                  onClick={payment.onClick}
                >
                  <TableCell className="pl-6 first:pt-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-base">
                        {payment.primary}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {payment.secondary}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {payment.meta}
                  </TableCell>
                  <TableCell className="pr-6">
                    <div className="flex flex-col items-end">
                      <span className="text-sm">{payment.value}</span>
                      {payment.subValue ? (
                        <span className="text-muted-foreground text-xs">
                          {payment.subValue}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default PaymentHistoryCard;
