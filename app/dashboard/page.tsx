import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DonorDashboardPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-16">
      <p className="text-sm font-medium text-muted-foreground">DONOR VIEW</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">
        Your donations
      </h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Donation history will be available here soon. You can explore active
        campaigns in the meantime.
      </p>
      <Button asChild className="mt-6">
        <Link href="/campaigns">Explore campaigns</Link>
      </Button>
    </main>
  );
}
