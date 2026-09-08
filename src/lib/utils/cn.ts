import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes so later conditional classes win over earlier ones
 * (e.g. a `className` prop overriding a component default) instead of both
 * landing in the DOM and letting CSS source order decide.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
