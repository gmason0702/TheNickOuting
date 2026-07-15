import { env } from "@/lib/env";
import { findRowByToken } from "@/lib/sheets";
import { NotFound } from "../NotFound";
import { RsvpForm } from "./RsvpForm";

export default async function RsvpPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const row = await findRowByToken(token);

  if (!row) return <NotFound />;

  return (
    <RsvpForm
      token={token}
      name={row.name}
      fee={env.perGolferFee}
      initialGolferCount={row.golfRsvpCount ?? 0}
      initialReceptionCount={row.receptionCount ?? 0}
    />
  );
}
