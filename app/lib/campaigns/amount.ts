export function parseSolAmount(input: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(input))
    throw new Error("Enter a SOL amount with at most 9 decimal places");
  const [whole, fraction = ""] = input.split(".");
  const amount =
    BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
  if (amount <= 0n || amount > 18_446_744_073_709_551_615n)
    throw new Error("Amount is out of range");
  return amount;
}
export function displaySol(amount: bigint) {
  const whole = amount / 1_000_000_000n;
  const fraction = (amount % 1_000_000_000n)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
