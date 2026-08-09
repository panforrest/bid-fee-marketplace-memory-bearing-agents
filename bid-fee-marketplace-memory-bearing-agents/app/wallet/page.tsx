import { SiteHeader } from "@/components/site-header";
import { WalletView } from "@/components/wallet-view";

export const dynamic = "force-dynamic";

export default function WalletPage() {
  return (
    <>
      <SiteHeader />
      <WalletView />
    </>
  );
}
