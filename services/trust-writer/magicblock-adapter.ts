/* eslint-disable @typescript-eslint/no-explicit-any -- generated Kit instruction inputs are structurally typed. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ConnectionMagicRouter,
  GetCommitmentSignature,
  MAGIC_CONTEXT_ID,
  MAGIC_PROGRAM_ID,
  delegationRecordPdaFromDelegatedAccount,
  getDelegationRecord,
  magicFeeVaultPdaFromValidator,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { GPLSESSION_PROGRAMS } from "@magicblock-labs/gum-sdk";
import { AccountRole, createKeyPairSignerFromBytes } from "@solana/kit";
import {
  getCommitTrustScoreInstructionAsync,
  getUpdateTrustScoreInstructionAsync,
} from "../../app/generated/aidtrace/instructions";
import { getGlobalConfigDecoder } from "../../app/generated/aidtrace/accounts/globalConfig";
import { getTrustScoreDecoder } from "../../app/generated/aidtrace/accounts/trustScore";
import { RiskBand } from "../../app/generated/aidtrace/types/riskBand";

const DEFAULT_PROGRAM = new PublicKey(
  "FsnkvMW3VLrpY1oarGW3ePS22bwoCNpP9PZdMFGW6E4M"
);
const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");

export class TrustWriterError extends Error {
  constructor(
    public code: string,
    message: string,
    public terminal = false
  ) {
    super(message);
    this.name = "TrustWriterError";
  }
}

const pda = (program: PublicKey, ...seeds: Buffer[]) =>
  PublicKey.findProgramAddressSync(seeds, program)[0];
const digest = (value: string) => createHash("sha256").update(value).digest();
function u64(value: bigint) {
  const result = Buffer.alloc(8);
  result.writeBigUInt64LE(value);
  return result;
}
function riskBand(value: string) {
  if (value === "low") return RiskBand.Low;
  if (value === "medium") return RiskBand.ReviewRecommended;
  if (value === "high") return RiskBand.HighPriorityReview;
  throw new TrustWriterError(
    "malformed_evaluation",
    "Unsupported risk band",
    true
  );
}
function web3Instruction(ix: any) {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    data: Buffer.from(ix.data),
    keys: ix.accounts.map((account: any) => ({
      pubkey: new PublicKey(account.address),
      isWritable:
        account.role === AccountRole.WRITABLE ||
        account.role === AccountRole.WRITABLE_SIGNER,
      isSigner:
        account.role === AccountRole.READONLY_SIGNER ||
        account.role === AccountRole.WRITABLE_SIGNER,
    })),
  });
}
function decodeSessionToken(data: Buffer) {
  if (data.length !== 144)
    throw new TrustWriterError(
      "malformed_session",
      "Session token has an invalid layout",
      true
    );
  return {
    authority: new PublicKey(data.subarray(8, 40)),
    targetProgram: new PublicKey(data.subarray(40, 72)),
    sessionSigner: new PublicKey(data.subarray(72, 104)),
    validUntil: Number(data.readBigInt64LE(136)),
  };
}

export async function createMagicBlockAdapter(env: NodeJS.ProcessEnv) {
  const baseUrl = env.MAGICBLOCK_BASE_RPC_URL ?? env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!baseUrl) throw new Error("MAGICBLOCK_BASE_RPC_URL is required");
  if (!env.MAGICBLOCK_ROUTER_URL)
    throw new Error("MAGICBLOCK_ROUTER_URL is required");
  const raw = JSON.parse(
    await readFile(env.TRUST_WRITER_SESSION_KEY_FILE!, "utf8")
  );
  if (!Array.isArray(raw) || raw.length !== 64)
    throw new TrustWriterError(
      "malformed_session",
      "Session key file must contain 64 bytes",
      true
    );
  const secret = Uint8Array.from(raw);
  const signer = Keypair.fromSecretKey(secret);
  const kitSigner = await createKeyPairSignerFromBytes(secret);
  const base = new Connection(baseUrl, "finalized");
  const router = new ConnectionMagicRouter(
    env.MAGICBLOCK_ROUTER_URL,
    "confirmed"
  );

  async function resolve(job: any) {
    const program = new PublicKey(job.program_id || DEFAULT_PROGRAM);
    const campaign = new PublicKey(job.subject_address);
    const config = pda(program, Buffer.from("config"));
    const trustScore = pda(program, Buffer.from("trust"), campaign.toBuffer());
    const automationPayer = pda(
      program,
      Buffer.from("trust_automation_payer"),
      campaign.toBuffer()
    );
    const fraudFlag = pda(
      program,
      Buffer.from("fraud_flag"),
      campaign.toBuffer()
    );
    const configInfo = await base.getAccountInfo(config, "finalized");
    if (!configInfo || !configInfo.owner.equals(program))
      throw new TrustWriterError(
        "configuration_unavailable",
        "Migrated config is unavailable"
      );
    const configData = getGlobalConfigDecoder().decode(configInfo.data);
    if (configData.protocolVersion < 2)
      throw new TrustWriterError(
        "configuration_not_migrated",
        "GlobalConfig v2 migration is required",
        true
      );

    const sessionProgram = GPLSESSION_PROGRAMS.devnet;
    const authority = new PublicKey(configData.trustAuthority);
    const sessionToken = pda(
      sessionProgram,
      Buffer.from("session_token_v2"),
      program.toBuffer(),
      signer.publicKey.toBuffer(),
      authority.toBuffer()
    );
    const sessionInfo = await base.getAccountInfo(sessionToken, "finalized");
    if (!sessionInfo)
      throw new TrustWriterError(
        "session_revoked",
        "Session token is missing or revoked",
        true
      );
    if (!sessionInfo.owner.equals(sessionProgram))
      throw new TrustWriterError(
        "malformed_session",
        "Session token owner is invalid",
        true
      );
    const session = decodeSessionToken(sessionInfo.data);
    if (
      !session.authority.equals(authority) ||
      !session.targetProgram.equals(program) ||
      !session.sessionSigner.equals(signer.publicKey)
    )
      throw new TrustWriterError(
        "session_scope",
        "Session authority, target, or signer is invalid",
        true
      );
    if (session.validUntil <= Math.floor(Date.now() / 1000))
      throw new TrustWriterError(
        "session_expired",
        "Session token has expired",
        true
      );

    const trustRecord = await getDelegationRecord(
      base,
      trustScore,
      "finalized"
    );
    const payerRecord = await getDelegationRecord(
      base,
      automationPayer,
      "finalized"
    );
    if (trustRecord.status !== 0 || payerRecord.status !== 0)
      throw new TrustWriterError(
        "delegation_pending",
        "Trust accounts are not both delegated"
      );
    if (!trustRecord.validator.equals(payerRecord.validator))
      throw new TrustWriterError(
        "router_mismatch",
        "Delegated accounts resolve to different validators"
      );
    let endpoint = env.MAGICBLOCK_ER_RPC_URL;
    if (!endpoint) {
      const closest = await router.getClosestValidator();
      if (
        closest.identity !== trustRecord.validator.toBase58() ||
        !closest.fqdn
      )
        throw new TrustWriterError(
          "router_mismatch",
          "Router did not return the delegated validator"
        );
      endpoint = closest.fqdn;
    }
    const er = new Connection(endpoint, "confirmed");
    if (
      (await (er as any).getIdentity()).identity !==
      trustRecord.validator.toBase58()
    )
      throw new TrustWriterError(
        "endpoint_mismatch",
        "ER endpoint identity does not match delegation"
      );
    return {
      program,
      campaign,
      configData,
      trustScore,
      automationPayer,
      fraudFlag,
      sessionToken,
      session,
      validator: trustRecord.validator,
      endpoint,
      er,
    };
  }

  return {
    async prepare(job: any) {
      const context = await resolve(job);
      const info = await context.er.getAccountInfo(
        context.trustScore,
        "confirmed"
      );
      const sequence = info
        ? getTrustScoreDecoder().decode(info.data).canonicalSequence
        : 0n;
      return {
        context,
        nextSequence: sequence + 1n,
        endpoint: context.endpoint,
        sessionPublicKey: signer.publicKey.toBase58(),
        sessionExpiresAt: new Date(context.session.validUntil * 1000),
      };
    },
    async execute(job: any, options: { reconcileOnly: boolean }) {
      const c = job.prepared?.context ?? (await resolve(job));
      const sequence = BigInt(job.expected_sequence);
      const flagEvent = pda(
        c.program,
        Buffer.from("fraud_flag_event"),
        c.fraudFlag.toBuffer(),
        u64(sequence)
      );
      const trustRecord = delegationRecordPdaFromDelegatedAccount(c.trustScore);
      const payerRecord = delegationRecordPdaFromDelegatedAccount(
        c.automationPayer
      );
      const feeVault = magicFeeVaultPdaFromValidator(c.validator);
      const instructions: TransactionInstruction[] = [];
      if (!options.reconcileOnly)
        instructions.push(
          web3Instruction(
            await getUpdateTrustScoreInstructionAsync({
              trustScore: c.trustScore.toBase58() as any,
              sessionToken: c.sessionToken.toBase58() as any,
              sessionSigner: kitSigner as any,
              score: Number(job.score),
              riskBand: riskBand(job.risk_band),
              modelVersionDigest: digest(job.model_version),
              reasonDigest: digest(job.reasons_json),
              checkpointSlot: BigInt(job.checkpoint_slot),
              evaluatedAt: BigInt(
                Math.floor(new Date(job.evaluated_at).getTime() / 1000)
              ),
              expectedSequence: sequence,
            })
          )
        );
      instructions.push(
        web3Instruction(
          await getCommitTrustScoreInstructionAsync({
            trustScore: c.trustScore.toBase58() as any,
            automationPayer: c.automationPayer.toBase58() as any,
            magicFeeVault: feeVault.toBase58() as any,
            trustScoreDelegationRecord: trustRecord.toBase58() as any,
            automationPayerDelegationRecord: payerRecord.toBase58() as any,
            sessionToken: c.sessionToken.toBase58() as any,
            sessionSigner: kitSigner as any,
            campaign: c.campaign.toBase58() as any,
            fraudFlag: c.fraudFlag.toBase58() as any,
            fraudFlagEvent: flagEvent.toBase58() as any,
            systemProgram: SYSTEM_PROGRAM.toBase58() as any,
            aidtraceProgram: c.program.toBase58() as any,
            magicProgram: MAGIC_PROGRAM_ID.toBase58() as any,
            magicContext: MAGIC_CONTEXT_ID.toBase58() as any,
          })
        )
      );
      const transaction = new Transaction().add(...instructions);
      const erSignature = await c.er.sendTransaction(transaction, [signer], {
        preflightCommitment: "confirmed",
      });
      await c.er.confirmTransaction(erSignature, "confirmed");
      const baseCommitSignature = await GetCommitmentSignature(
        erSignature,
        c.er
      );
      if (
        (await base.confirmTransaction(baseCommitSignature, "finalized")).value
          .err
      )
        throw new TrustWriterError(
          "base_confirmation_failed",
          "Base commitment did not finalize"
        );
      const canonicalInfo = await base.getAccountInfo(
        c.trustScore,
        "finalized"
      );
      if (
        !canonicalInfo ||
        getTrustScoreDecoder().decode(canonicalInfo.data).canonicalSequence !==
          sequence
      )
        throw new TrustWriterError(
          "base_verification_failed",
          "Canonical sequence does not match"
        );
      let actionOutcome = "not_required";
      if (Number(job.score) >= c.configData.fraudThreshold) {
        const [flag, event] = await base.getMultipleAccountsInfo(
          [c.fraudFlag, flagEvent],
          "finalized"
        );
        actionOutcome = flag && event ? "confirmed" : "pending";
      }
      return { erSignature, baseCommitSignature, actionOutcome };
    },
  };
}
