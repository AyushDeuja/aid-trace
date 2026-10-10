import Link from "next/link";
import { DatabaseZap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyCampaigns({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-10 text-center">
      <DatabaseZap
        className="size-8 text-muted-foreground"
        aria-hidden="true"
      />
      <h3 className="mt-4 font-serif text-2xl">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <Button variant="outline" asChild className="mt-5">
        <Link href="/campaigns">Open campaign directory</Link>
      </Button>
    </div>
  );
}
