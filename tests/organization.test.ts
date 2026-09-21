import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { AccountRole, address, getAddressEncoder } from "@solana/kit";
import {
  PROGRAM_ID,
  acceptAuthorityIx,
  decodeOrganization,
  fetchOrganization,
  nominateAuthorityIx,
  organizationPda,
  registerOrganizationIx,
  setStatusIx,
  setVerifiedIx,
  updateMetadataIx,
} from "../app/lib/organizations/chain";
import {
  fetchVerifiedMetadata,
  validateMetadata,
  validateMetadataUri,
} from "../app/lib/organizations/metadata";

const founder = address("11111111111111111111111111111111");
const other = address("SysvarRent111111111111111111111111111111111");
const digest = "ab".repeat(32);
const encoder = getAddressEncoder();
function discriminator(value: string) {
  return createHash("sha256").update(value).digest().subarray(0, 8);
}
function sampleAccount(
  options: { pending?: boolean; status?: number; verified?: boolean } = {}
) {
  const data = Buffer.alloc(156);
  discriminator("account:Organization").copy(data, 0);
  data.set(encoder.encode(founder), 8);
  data.set(encoder.encode(other), 40);
  data[72] = options.pending ? 1 : 0;
  if (options.pending) data.set(encoder.encode(founder), 73);
  data.fill(0xab, 105, 137);
  data[137] = options.status ?? 0;
  data[138] = options.verified ? 1 : 0;
  data.writeBigUInt64LE(12n, 139);
  data.writeBigUInt64LE(3n, 147);
  data[155] = 254;
  return data;
}

test("registration derives one stable founder PDA and encodes the right signer and digest", async () => {
  const first = await organizationPda(founder);
  assert.equal(first, await organizationPda(founder));
  assert.notEqual(first, await organizationPda(other));
  const ix = await registerOrganizationIx(founder, digest);
  assert.equal(ix.programAddress, PROGRAM_ID);
  assert.equal(ix.accounts?.[0].address, first);
  assert.equal(ix.accounts?.[1].role, AccountRole.WRITABLE_SIGNER);
  assert.deepEqual(
    Buffer.from(ix.data!).subarray(0, 8),
    discriminator("global:register_organization")
  );
  assert.equal(Buffer.from(ix.data!).subarray(8).toString("hex"), digest);
  await assert.rejects(() => registerOrganizationIx(founder, "00"), /32-byte/);
});

test("organization instructions preserve current authority and admin account roles", async () => {
  const org = decodeOrganization(
    await organizationPda(founder),
    sampleAccount({ pending: true, status: 1, verified: true })
  );
  assert.equal(org.founder, founder);
  assert.equal(org.authority, other);
  assert.equal(org.pendingAuthority, founder);
  assert.equal(org.status, "Active");
  assert.equal(org.verified, true);
  assert.equal(org.verifiedDeliveryCount, 12n);
  assert.equal(org.nextCampaignId, 3n);
  assert.equal(
    (await updateMetadataIx(org, digest)).accounts?.[1].address,
    other
  );
  assert.equal(
    (await nominateAuthorityIx(org, founder)).accounts?.[1].role,
    AccountRole.READONLY_SIGNER
  );
  assert.equal(
    (await acceptAuthorityIx(org, founder)).accounts?.[1].address,
    founder
  );
  const verify = await setVerifiedIx(org, founder, true);
  assert.equal(verify.accounts?.[2].role, AccountRole.READONLY_SIGNER);
  assert.equal(Buffer.from(verify.data!).at(-1), 1);
  const close = await setStatusIx(org, founder, "Closed");
  assert.equal(Buffer.from(close.data!).at(-1), 3);
});

test("decoder rejects malformed organization layout and enum values", async () => {
  const key = await organizationPda(founder);
  assert.throws(
    () => decodeOrganization(key, sampleAccount().subarray(0, 155)),
    /size/
  );
  const invalidOption = sampleAccount();
  invalidOption[72] = 2;
  assert.throws(
    () => decodeOrganization(key, invalidOption),
    /pending authority/
  );
  const invalidStatus = sampleAccount();
  invalidStatus[137] = 4;
  assert.throws(() => decodeOrganization(key, invalidStatus), /status/);
});

test("RPC reader rejects wrong owner, discriminator and founder PDA", async () => {
  const previous = globalThis.fetch;
  const key = await organizationPda(founder);
  const respond = (owner: string, data: Buffer) => {
    globalThis.fetch = async () =>
      Response.json({
        result: { value: { owner, data: [data.toString("base64"), "base64"] } },
      });
  };
  try {
    respond(other, sampleAccount());
    await assert.rejects(() => fetchOrganization("devnet", key), /owner/);
    const badDiscriminator = sampleAccount();
    badDiscriminator[0] = 0;
    respond(PROGRAM_ID, badDiscriminator);
    await assert.rejects(
      () => fetchOrganization("devnet", key),
      /discriminator/
    );
    respond(PROGRAM_ID, sampleAccount());
    assert.equal((await fetchOrganization("devnet", key))?.status, "Pending");
    await assert.rejects(
      () => fetchOrganization("devnet", address(other)),
      /PDA/
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test("metadata accepts valid profiles and rejects unsafe references", () => {
  assert.equal(
    validateMetadata({
      name: " Relief ",
      description: "Verified delivery partner",
    }).name,
    "Relief"
  );
  assert.throws(
    () => validateMetadata({ name: "R", description: "short" }),
    /Name/
  );
  assert.throws(
    () =>
      validateMetadata({
        name: "Relief",
        description: "Verified delivery partner",
        website: "http://example.org",
      }),
    /HTTPS/
  );
  assert.equal(
    validateMetadataUri("https://ipfs.io/ipfs/bafybeigdyrzt"),
    "https://ipfs.io/ipfs/bafybeigdyrzt"
  );
  for (const uri of [
    "http://ipfs.io/ipfs/bafy",
    "https://example.com/ipfs/bafy",
    "https://ipfs.io.evil.test/ipfs/bafy",
    "https://ipfs.io/ipfs/bafy?next=1",
  ]) {
    assert.throws(() => validateMetadataUri(uri), /ipfs.io/);
  }
});

test("metadata display requires exact JSON bytes matching the canonical hash", async () => {
  const previous = globalThis.fetch;
  const bytes = Buffer.from(
    JSON.stringify({ name: "Relief", description: "Verified delivery partner" })
  );
  const hash = createHash("sha256").update(bytes).digest("hex");
  globalThis.fetch = async () => new Response(bytes);
  try {
    assert.equal(
      (await fetchVerifiedMetadata("https://ipfs.io/ipfs/bafybeigdyrzt", hash))
        .name,
      "Relief"
    );
    await assert.rejects(
      () => fetchVerifiedMetadata("https://ipfs.io/ipfs/bafybeigdyrzt", digest),
      /does not match/
    );
  } finally {
    globalThis.fetch = previous;
  }
});
