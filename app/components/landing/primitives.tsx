import { ArrowUpRight, CheckCircle2, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";

export function Eyebrow({
  children,
  light = false,
}: {
  children: ReactNode;
  light?: boolean;
}) {
  return (
    <p
      className={`flex items-center gap-2 text-[11px] font-extrabold tracking-[.08em] ${light ? "text-cyan-200" : "text-primary"}`}
    >
      <span className="h-px w-5 bg-current" />
      {children}
    </p>
  );
}

export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="border-l-2 border-primary px-5 py-6">
      <p className="text-xs font-bold uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-serif text-3xl">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </article>
  );
}

export function LiveFundPath({
  live,
  canonical,
}: {
  live: string;
  canonical: string;
}) {
  const stages = ["Donor", "Vault", "Allocate", "Deliver", "Verify"];
  return (
    <section
      className="rounded-lg border border-white/20 bg-[#17130e]/85 p-5 shadow-2xl backdrop-blur-md"
      aria-label="Live fund path"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-extrabold text-white">LIVE FUND PATH</h2>
        <Badge variant="live">
          <Zap className="size-3" />
          Reconciled 4m ago
        </Badge>
      </div>
      <ol className="relative mt-7 grid grid-cols-5">
        {stages.map((stage, index) => (
          <li key={stage} className="relative">
            <span className="absolute left-1/2 right-0 top-5 h-px bg-red-500 last:hidden" />
            <span className="relative z-10 grid size-10 place-items-center rounded-full border border-white/25 bg-white/10 text-xs font-bold text-white">
              0{index + 1}
            </span>
            <span className="mt-3 block text-[10px] font-bold uppercase text-white/65 sm:text-xs">
              {stage}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-7 flex items-end justify-between border-t border-white/15 pt-5">
        <div>
          <strong className="font-serif text-4xl text-[#fffaf0]">
            {live} SOL
          </strong>
          <p className="mt-1 text-sm text-white/60">
            Live · {canonical} confirmed
          </p>
        </div>
        <ArrowUpRight className="size-6 text-red-400" />
      </div>
    </section>
  );
}

export function ActiveBadge() {
  return (
    <Badge variant="verified">
      <CheckCircle2 className="size-3" />
      Active
    </Badge>
  );
}
