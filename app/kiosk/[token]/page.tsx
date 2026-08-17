import { KioskClient } from "./kiosk-client";

export default async function KioskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <KioskClient token={token} />;
}
