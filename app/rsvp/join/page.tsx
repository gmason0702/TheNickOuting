import { env } from "@/lib/env";
import { getTotalGolferCount } from "@/lib/sheets";
import { JoinForm } from "./JoinForm";
import { WalkinClosed } from "./WalkinClosed";

export default async function JoinPage() {
  if (!env.walkinEnabled) return <WalkinClosed />;

  const othersGolferCount = await getTotalGolferCount();

  return (
    <JoinForm fee={env.perGolferFee} receptionFee={env.perReceptionFee} othersGolferCount={othersGolferCount} />
  );
}
