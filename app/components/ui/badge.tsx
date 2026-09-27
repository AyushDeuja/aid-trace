import * as React from "react";

type Variant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive";
const variants: Record<Variant, string> = { default: "bg-[#302a21] text-white", secondary: "bg-[#eee7db] text-[#5d554a]", outline: "border border-current bg-transparent text-[#5d554a]", success: "bg-[#dff1e1] text-[#29603a]", warning: "bg-[#f6e6bd] text-[#815b13]", destructive: "bg-red-100 text-red-800" };

export function Badge({ className = "", variant = "default", ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: Variant }) {
  return <div className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide ${variants[variant]} ${className}`} {...props} />;
}
