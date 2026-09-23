import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getBase58Decoder,
  getProgramDerivedAddress,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
} from "@solana/kit";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROGRAM_ID = address("FsnkvMW3VLrpY1oarGW3ePS22bwoCNpP9PZdMFGW6E4M");
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const rpc = createSolanaRpc("http://127.0.0.1:8899");
const rpcSubscriptions = createSolanaRpcSubscriptions("ws://127.0.0.1:8900");
const walletPath = path.join(os.homedir(), ".config", "solana", "id.json");

if (!fs.existsSync(walletPath))
  throw new Error(`Solana wallet not found at ${walletPath}`);

const signer = await createKeyPairSignerFromBytes(
  new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf8")))
);
const [config] = await getProgramDerivedAddress({
  programAddress: PROGRAM_ID,
  seeds: [new TextEncoder().encode("config")],
});
const existing = await rpc
  .getAccountInfo(config, { encoding: "base64", commitment: "confirmed" })
  .send();

if (existing.value) {
  console.log("GlobalConfig already exists:", config);
  process.exit(0);
}

// First eight bytes of SHA-256("global:initialize_config").
const instruction = {
  programAddress: PROGRAM_ID,
  accounts: [
    { address: config, role: AccountRole.WRITABLE },
    { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
    { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
  ],
  data: new Uint8Array([208, 127, 21, 1, 194, 190, 196, 70]),
};
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
const message = pipe(
  createTransactionMessage({ version: 0 }),
  (tx) => setTransactionMessageFeePayerSigner(signer, tx),
  (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  (tx) => appendTransactionMessageInstruction(instruction, tx)
);
const signed = await signTransactionMessageWithSigners(message);
await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signed, {
  commitment: "confirmed",
});
const signature = getBase58Decoder().decode(signed.signatures[signer.address]);
console.log("GlobalConfig initialized:", config);
console.log("Admin wallet:", signer.address);
console.log("Transaction:", signature);
