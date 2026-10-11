"use client";

import { useState, useCallback, useMemo } from "react";
import { useSWRConfig } from "swr";
import {
  address,
  appendTransactionMessageInstruction,
  createEmptyClient,
  createTransactionMessage,
  createTransactionPlanner,
  pipe,
  setTransactionMessageFeePayerSigner,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import { rpc, rpcTransactionPlanExecutor } from "@solana/kit-plugin-rpc";
import {
  planAndSendTransactions,
  transactionPlanner,
} from "@solana/kit-plugin-instruction-plan";
import { useWallet } from "../wallet/context";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl, getClusterWsConfig } from "../solana-client";

const COMPUTE_BUDGET_PROGRAM = address(
  "ComputeBudget111111111111111111111111111111"
);
// Explicitly setting a non-default limit avoids a pre-signature RPC simulation
// that can delay a Phantom approval prompt when public Devnet RPC is busy.
const computeUnitLimitInstruction: Instruction = {
  programAddress: COMPUTE_BUDGET_PROGRAM,
  accounts: [],
  // SetComputeUnitLimit (2), then 1,000,000 as a little-endian u32.
  data: Uint8Array.of(2, 0x40, 0x42, 0x0f, 0x00),
};
const loadedAccountsDataSizeLimitInstruction: Instruction = {
  programAddress: COMPUTE_BUDGET_PROGRAM,
  accounts: [],
  // SetLoadedAccountsDataSizeLimit (4), then 64 MiB as a little-endian u32.
  // Versioned transaction planning otherwise simulates to estimate this value.
  data: Uint8Array.of(4, 0x00, 0x00, 0x00, 0x04),
};

function createFixedLimitTransactionClient(
  cluster: Parameters<typeof getClusterUrl>[0],
  signer: TransactionSigner
) {
  // The stock RPC planner first inserts a provisional compute instruction,
  // which forces a simulation. This planner inserts concrete limits instead.
  return createEmptyClient()
    .use(rpc(getClusterUrl(cluster), getClusterWsConfig(cluster)))
    .use(
      transactionPlanner(
        createTransactionPlanner({
          createTransactionMessage: () =>
            pipe(
              createTransactionMessage({ version: 0 }),
              (message) => setTransactionMessageFeePayerSigner(signer, message),
              (message) =>
                appendTransactionMessageInstruction(
                  computeUnitLimitInstruction,
                  message
                ),
              (message) =>
                appendTransactionMessageInstruction(
                  loadedAccountsDataSizeLimitInstruction,
                  message
                )
            ),
        })
      )
    )
    .use(
      rpcTransactionPlanExecutor({
        maxConcurrency: 1,
        skipPreflight: true,
      })
    )
    .use(planAndSendTransactions());
}

export function useSendTransaction() {
  const { signer } = useWallet();
  const { cluster } = useCluster();
  const { mutate } = useSWRConfig();
  const [isSending, setIsSending] = useState(false);

  const txClient = useMemo(
    () => (signer ? createFixedLimitTransactionClient(cluster, signer) : null),
    [cluster, signer]
  );

  const send = useCallback(
    async ({ instructions }: { instructions: readonly Instruction[] }) => {
      if (!txClient) throw new Error("Wallet not connected");

      setIsSending(true);
      try {
        const result = await txClient.sendTransaction([...instructions]);
        mutate((key: unknown) => Array.isArray(key) && key[0] === "balance");
        return result.context.signature;
      } finally {
        setIsSending(false);
      }
    },
    [txClient, mutate]
  );

  return { send, isSending };
}
