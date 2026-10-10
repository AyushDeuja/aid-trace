import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Database,
  HandHeart,
  Route,
  WalletCards,
} from "lucide-react";
import styles from "./page.module.css";

type Step = {
  number: string;
  title: string;
  description: string;
  roles: string[];
  href: string;
  linkLabel: string;
  Icon: LucideIcon;
};

const steps: Step[] = [
  {
    number: "01",
    title: "Discover an active campaign",
    description:
      "Browse public campaigns, then open one to inspect its canonical status, goal, raised amount and signed on-chain details before giving.",
    roles: ["Public observer", "Donor"],
    href: "/campaigns",
    linkLabel: "Explore campaigns",
    Icon: Route,
  },
  {
    number: "02",
    title: "Donate from your wallet",
    description:
      "Connect a supported Solana wallet and donate SOL to the selected campaign. The donation is recorded against that campaign on Solana.",
    roles: ["Donor"],
    href: "/campaigns",
    linkLabel: "Choose a campaign",
    Icon: WalletCards,
  },
  {
    number: "03",
    title: "Follow the durable record",
    description:
      "Campaign status, donations, allocations, disbursements and attached evidence metadata are designed to remain independently auditable through canonical records.",
    roles: ["Public observer", "Donor"],
    href: "/campaigns",
    linkLabel: "View campaign records",
    Icon: Database,
  },
  {
    number: "04",
    title: "Put relief funds to work",
    description:
      "Approved organization operators create campaign allocations, record disbursements and attach delivery evidence. Authorized verifiers then confirm delivery outcomes.",
    roles: ["Organization operator", "Verifier"],
    href: "/org/finance",
    linkLabel: "Organization finance",
    Icon: HandHeart,
  },
  {
    number: "05",
    title: "Keep consequential decisions human",
    description:
      "Fraud signals and disaster candidates inform review, while administrators verify organizations and approve campaign activation. AI and realtime counters assist; neither controls funds.",
    roles: ["Admin", "Organization operator"],
    href: "/admin/review",
    linkLabel: "Admin review",
    Icon: BadgeCheck,
  },
];

export default function HowItWorksPage() {
  return (
    <main className={styles.page}>
      <section className={styles.content} aria-labelledby="page-title">
        <header className={styles.header}>
          <p className={styles.eyebrow}>
            <span aria-hidden="true" />
            Open infrastructure, clear responsibility
          </p>
          <h1 id="page-title">How AidTrace works</h1>
          <p className={styles.intro}>
            Follow relief money from a public campaign to evidence-backed
            delivery, with a person accountable at every consequential step.
          </p>
        </header>

        <ol className={styles.steps}>
          {steps.map(
            ({ number, title, description, roles, href, linkLabel, Icon }) => (
              <li className={styles.step} key={number}>
                <span className={styles.number}>{number}</span>
                <div className={styles.summary}>
                  <Icon aria-hidden="true" className={styles.icon} />
                  <h2>{title}</h2>
                  <div
                    className={styles.roles}
                    aria-label={`Roles: ${roles.join(", ")}`}
                  >
                    {roles.map((role) => (
                      <span key={role}>{role}</span>
                    ))}
                  </div>
                </div>
                <div className={styles.detail}>
                  <p>{description}</p>
                  <Link className={styles.link} href={href}>
                    {linkLabel}
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                </div>
              </li>
            )
          )}
        </ol>

        <aside className={styles.note} aria-label="Product boundaries">
          <strong>What stays in control</strong>
          <p>
            Solana holds the canonical financial record. MagicBlock can make
            presentation state react quickly and reconcile with it. The donor
            dashboard is still forthcoming; use campaign pages to inspect the
            currently available public trail.
          </p>
        </aside>
      </section>
    </main>
  );
}
