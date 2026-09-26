type FieldNote = {
  name: string;
  handle: string;
  initials: string;
  message: string;
  label: string;
  imagePlaceholder?: boolean;
};

const lanes: FieldNote[][] = [
  [
    { name: "Karnali field desk", handle: "@karnali_relief", initials: "KR", message: "Water-kit delivery ledger is now reconciled with the campaign vault. 480 families checked in.", label: "Human update", imagePlaceholder: true },
    { name: "Open Relief Map", handle: "@openreliefmap", initials: "OR", message: "Public fund trails make it easier for local communities to ask precise questions about delivery.", label: "Community note" },
    { name: "AidTrace verifier", handle: "@aidtrace_verify", initials: "AT", message: "Evidence references are queued separately from financial custody. Review remains human-owned.", label: "Verification" },
  ],
  [
    { name: "Himalayan Relief", handle: "@himalayanrelief", initials: "HR", message: "A donation is more useful when its next step stays visible: vault, allocation, delivery, verification.", label: "Organization update", imagePlaceholder: true },
    { name: "Ward 6 mutual aid", handle: "@ward6_aid", initials: "W6", message: "We received the first water-kit manifest and can match it to the published allocation.", label: "Field note" },
    { name: "AidTrace ledger", handle: "@aidtrace", initials: "AT", message: "Canonical balances remain the source of truth; realtime views will reconcile against them.", label: "Protocol note" },
  ],
  [
    { name: "Community observer", handle: "@relief_observer", initials: "CO", message: "Transparency is not a dashboard alone—it is the ability to follow a decision to its evidence.", label: "Observer note" },
    { name: "Karnali logistics", handle: "@karnali_logistics", initials: "KL", message: "Delivery documents are being prepared for independent review before a verification decision.", label: "Delivery update", imagePlaceholder: true },
    { name: "AidTrace field notes", handle: "@aidtrace_notes", initials: "AN", message: "This stream is a prototype. Future updates will be sourced from permitted realtime program events.", label: "Prototype" },
  ],
];

function TweetStyleCard({ note }: { note: FieldNote }) {
  return <article className="border border-[#d8d0c2] bg-[#fffdf8] p-4 shadow-[0_8px_30px_-26px_#302a21]">
    <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#302a21] text-xs font-bold text-[#fffdf8]">{note.initials}</span><div className="min-w-0"><div className="flex items-center justify-between gap-2"><strong className="truncate text-sm">{note.name}</strong><span aria-hidden="true" className="text-lg leading-none">𝕏</span></div><p className="text-xs text-[#776f63]">{note.handle}</p></div></div>
    <p className="mt-3 text-sm leading-relaxed text-[#40392f]">{note.message}</p>
    {note.imagePlaceholder && <div className="relative mt-4 aspect-[16/8] overflow-hidden border border-[#d8d0c2] bg-[#d9d1c2]" aria-label="Dummy field image placeholder"><div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.5),transparent_45%,rgba(48,38,28,.14))]" /><span className="absolute bottom-2 right-2 bg-white/70 px-1.5 py-1 text-[9px] font-bold uppercase tracking-[.1em] text-[#625a4e]">Dummy image</span></div>}
    <div className="mt-4 flex items-center justify-between border-t border-[#e6ded1] pt-3 text-xs"><span className="font-bold text-[#776f63]">{note.label}</span><span className="text-[#776f63]">↗ field stream</span></div>
  </article>;
}

export function FieldNotesMarquee() {
  return <section className="overflow-hidden border-y border-[#d8d0c2] bg-[#eee7db] py-16" aria-labelledby="field-notes-title">
    <div className="mx-auto mb-9 flex max-w-[1400px] flex-wrap items-end justify-between gap-4 px-5 md:px-8"><div><p className="mb-3 text-xs font-extrabold tracking-[.12em] text-red-700">— PROTOTYPE REALTIME STREAM</p><h2 id="field-notes-title" className="font-serif text-4xl">What the field is saying.</h2><p className="mt-2 max-w-xl text-sm text-[#776f63]">Dummy field notes in an alternating vertical marquee. MagicBlock events will replace this sample feed in a later integration.</p></div><span className="border border-amber-600/30 bg-amber-100 px-2 py-1 text-xs font-bold text-amber-950">Sample data · no live feed</span></div>
    <div className="relative mx-auto grid h-[520px] max-w-[1400px] grid-cols-1 gap-5 overflow-hidden px-5 sm:grid-cols-2 md:px-8 lg:grid-cols-3">
      {lanes.map((lane, index) => <div key={index} className={`field-note-lane ${index % 2 ? "field-note-lane-reverse" : ""} hidden flex-col gap-4 ${index === 2 ? "lg:flex" : "flex"}`}>
        {[...lane, ...lane].map((note, noteIndex) => <TweetStyleCard key={`${note.handle}-${noteIndex}`} note={note} />)}
      </div>)}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#eee7db] to-transparent" /><div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#eee7db] to-transparent" />
    </div>
  </section>;
}
