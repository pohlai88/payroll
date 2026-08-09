/**
 * @feature shell
 * @layer ui
 *
 * shadcn UI primitive (shared).
 */

"use client";

import {
  AnimatePresence,
  type HTMLMotionProps,
  motion,
  type Transition,
} from "motion/react";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ToggleGroup as BaseToggleGroup,
  ToggleGroupItem as BaseToggleGroupItem,
} from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

interface MotionToggleGroupContextProps {
  type?: "single" | "multiple";
  transition?: Transition;
  activeClassName?: string;
  globalId: string;
}

const MotionToggleGroupContext = createContext<
  MotionToggleGroupContextProps | undefined
>(undefined);

const useMotionToggleGroup = (): MotionToggleGroupContextProps => {
  const context = useContext(MotionToggleGroupContext);

  if (!context) {
    throw new Error("useMotionToggleGroup must be used within a ToggleGroup");
  }

  return context;
};

type ToggleGroupProps = ComponentProps<typeof BaseToggleGroup> & {
  type?: "single" | "multiple";
  transition?: Transition;
  activeClassName?: string;
};

function ToggleGroup({
  className,
  variant,
  size,
  children,
  type,
  transition = { type: "spring", bounce: 0, stiffness: 200, damping: 25 },
  activeClassName,
  value,
  defaultValue,
  onValueChange,
  ...props
}: ToggleGroupProps) {
  const globalId = useId();
  const isSingle = type === "single";

  // For single mode, keep at most one value selected and prevent deselection.
  const [singleValue, setSingleValue] = useState<readonly string[]>(
    defaultValue ?? value ?? []
  );

  // Keep in sync when controlled externally (single mode)
  useEffect(() => {
    if (isSingle && value !== undefined) {
      setSingleValue(value);
    }
  }, [isSingle, value]);

  const handleSingleValueChange = useCallback(
    (
      newValue: string[],
      eventDetails: Parameters<
        NonNullable<ComponentProps<typeof BaseToggleGroup>["onValueChange"]>
      >[1]
    ) => {
      // Keep only the last selected item; ignore deselect (empty array)
      if (newValue.length === 0) {
        return;
      }

      const last = newValue.at(-1);
      if (last === undefined) {
        return;
      }

      const next = [last];

      setSingleValue(next);
      onValueChange?.(next, eventDetails);
    },
    [onValueChange]
  );

  return (
    <MotionToggleGroupContext.Provider
      value={{
        type,
        transition,
        activeClassName,
        globalId,
      }}
    >
      {isSingle ? (
        <BaseToggleGroup
          className={cn("relative", className)}
          onValueChange={handleSingleValueChange}
          size={size}
          value={singleValue}
          variant={variant}
          {...props}
        >
          {children}
        </BaseToggleGroup>
      ) : (
        <BaseToggleGroup
          className={cn("relative", className)}
          defaultValue={defaultValue}
          onValueChange={onValueChange}
          size={size}
          value={value}
          variant={variant}
          {...props}
        >
          {children}
        </BaseToggleGroup>
      )}
    </MotionToggleGroupContext.Provider>
  );
}

type ToggleGroupItemProps = ComponentProps<typeof BaseToggleGroupItem> & {
  children?: ReactNode;
  motionProps?: HTMLMotionProps<"div">;
  spanProps?: ComponentProps<"span">;
};

function ToggleGroupItem({
  ref,
  className,
  children,
  motionProps,
  spanProps,
  ...props
}: ToggleGroupItemProps) {
  const { activeClassName, transition, type, globalId } =
    useMotionToggleGroup();
  const itemRef = useRef<HTMLButtonElement | null>(null);

  useImperativeHandle(ref, () => itemRef.current as HTMLButtonElement);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const node = itemRef.current;

    if (!node) {
      return;
    }

    const observer = new MutationObserver(() => {
      setIsActive(node.hasAttribute("data-pressed"));
    });

    observer.observe(node, {
      attributes: true,
      attributeFilter: ["data-pressed"],
    });

    setIsActive(node.hasAttribute("data-pressed"));

    return () => observer.disconnect();
  }, []);

  return (
    <BaseToggleGroupItem
      ref={itemRef}
      {...props}
      className={cn(
        "relative hover:bg-transparent data-pressed:bg-transparent",
        className
      )}
    >
      <motion.div
        data-slot="toggle-group-item-motion"
        initial={{ scale: 1 }}
        whileTap={{ scale: 0.9 }}
        {...motionProps}
        className={cn(
          "relative flex h-full w-full items-center justify-center",
          motionProps?.className
        )}
      >
        <span
          {...spanProps}
          className={cn("relative z-1", spanProps?.className)}
          data-state={isActive ? "on" : "off"}
        >
          {children}
        </span>

        <AnimatePresence initial={false}>
          {isActive && type === "single" && (
            <motion.span
              animate={{ opacity: 1 }}
              className={cn(
                "absolute inset-0 z-0 rounded-md bg-muted",
                activeClassName
              )}
              data-slot="active-toggle-group-item"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              layoutId={`active-toggle-group-item-${globalId}`}
              transition={transition}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </BaseToggleGroupItem>
  );
}

export {
  ToggleGroup,
  ToggleGroupItem,
  type ToggleGroupItemProps,
  type ToggleGroupProps,
};
