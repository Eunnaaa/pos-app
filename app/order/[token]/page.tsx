import { SelfOrderFlow } from "@/components/self-order/self-order-flow";

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SelfOrderFlow token={token} variant="mobile" />;
}
