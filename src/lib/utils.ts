/**
 * @feature shell
 * @layer ui
 *
 * cn() and shared non-UI helpers.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
