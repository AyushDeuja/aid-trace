import * as React from "react";

type Variant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type Size = "default" | "sm" | "lg" | "icon";

const variants: Record<Variant, string> = {
  default: "bg-red-700 text-white shadow-sm hover:bg-red-800",
  secondary: "bg-[#eee7db] text-[#302a21] hover:bg-[#e4dacb]",
  outline: "border border-[#d8d0c2] bg-transparent text-[#302a21] hover:bg-[#eee7db]",
  ghost: "bg-transparent text-[#302a21] hover:bg-[#eee7db]",
  destructive: "bg-red-700 text-white hover:bg-red-800",
};
const sizes: Record<Size, string> = { default: "h-10 px-4 py-2", sm: "h-8 px-3 text-xs", lg: "h-11 px-5 text-sm", icon: "size-9 p-0" };

export function buttonVariants({ variant = "default", size = "default", className = "" }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return `inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`;
}

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  ({ className, variant, size, type = "button", ...props }, ref) => <button ref={ref} type={type} className={buttonVariants({ variant, size, className })} {...props} />
);
Button.displayName = "Button";
