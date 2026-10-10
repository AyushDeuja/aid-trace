import Link from "next/link";
import { MapPin, ShieldCheck } from "lucide-react";
import { ActiveBadge } from "./primitives";

export type LandingCampaign = {
  id: string;
  address?: string;
  title: string;
  location: string;
  organization: string;
  summary: string;
  live: number;
  canonical: number;
  goal: number;
  verified: number;
};

export function CampaignCard({ campaign }: { campaign: LandingCampaign }) {
  const progress = Math.min(
    Math.round((campaign.live / campaign.goal) * 100),
    100
  );
  return (
    <Link
      href={campaign.address ? `/campaigns/${campaign.address}` : "/campaigns"}
      className="group overflow-hidden rounded-lg border bg-card shadow-[0_8px_30px_-26px_var(--foreground)] transition hover:-translate-y-0.5"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        <div
          className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-[1.04]"
          style={{ backgroundImage: "url('/relief-documentary.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/15" />
        <div className="absolute left-4 top-4">
          <ActiveBadge />
        </div>
      </div>
      <div className="p-5">
        <h3 className="font-serif text-2xl leading-tight">{campaign.title}</h3>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-3.5" />
          {campaign.location}
        </p>
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {campaign.summary}
        </p>
        <div className="mt-5 flex items-end justify-between text-sm">
          <span>
            <b>{campaign.live.toFixed(1)}</b> / {campaign.goal.toLocaleString()}{" "}
            SOL
          </span>
          <b>{progress}%</b>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
          <span>{campaign.organization}</span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="size-3.5 text-emerald-700" />
            {campaign.verified} verified
          </span>
        </div>
      </div>
    </Link>
  );
}
