import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DonorDashboardPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-12 md:px-8">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground">DONOR</p>
      <h1 className="mt-3 font-serif text-4xl tracking-tight">Your donations</h1>
      <section className="mt-8 rounded-xl border border-[#ddd7cf] bg-card p-6 shadow-sm">
        <h2 className="font-serif text-2xl">Donation history</h2>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Your confirmed donation history will appear here once indexed. You can
          explore active campaigns in the meantime.
        </p>
        <Button asChild className="mt-6">
          <Link href="/campaigns">Explore campaigns</Link>
        </Button>
      </section>
    </main>
  );
}
