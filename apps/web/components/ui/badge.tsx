import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30",
        secondary:
          "border-[var(--border)] bg-[var(--bg-elev-2)] text-[var(--fg-muted)]",
        outline:
          "border-[var(--border-strong)] text-[var(--fg)]",
        success:
          "border-transparent bg-[color-mix(in_oklab,var(--success)_15%,transparent)] text-[var(--success)] border-[color-mix(in_oklab,var(--success)_30%,transparent)]",
        danger:
          "border-transparent bg-[color-mix(in_oklab,var(--danger)_15%,transparent)] text-[var(--danger)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
