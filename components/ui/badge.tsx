import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-bold",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        live: "bg-cyan-100 text-cyan-950",
        verified: "bg-emerald-100 text-emerald-900",
        warning: "bg-amber-100 text-amber-900",
        outline: "border border-current bg-transparent",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

export { Badge, badgeVariants };
