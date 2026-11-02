import MobileSaves from '../../components/mobile/MobileSaves';
import { first } from '../../components/mobile/MobileHome';

export const dynamic = 'force-dynamic';

type RawParams = { [key: string]: string | string[] | undefined };

/** "My Saves" tab — mirrors the mobile app's saves list. */
export default async function SavesPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const sp = await searchParams;
  const p = new URLSearchParams();
  for (const k of ['lat', 'lng', 'label', 'radius']) {
    const v = first((sp as Record<string, string | string[] | undefined>)[k]);
    if (v) p.set(k, v);
  }
  const qs = p.toString();
  return <MobileSaves qs={qs ? `?${qs}` : ''} />;
}
