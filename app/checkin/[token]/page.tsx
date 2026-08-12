import CheckInClient from "./CheckInClient";

/**
 * Public page — no auth, no nav. A driver opens this from a text message.
 */
export default async function CheckInPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CheckInClient token={token} />;
}
