import { Resolver, lookup } from 'node:dns/promises';

const bounded = <T>(operation: Promise<T>) =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('System DNS timeout')),
      5000,
    );
    operation.then(resolve, reject).finally(() => clearTimeout(timeout));
  });

/** Some macOS VPNs expose system DNS only through the OS resolver, while Go's
 * SRV resolver sees an unavailable localhost stub. Resolve addresses through
 * the OS in that case. TLS peer names are still verified by cloudflared.
 * --edge is pinned to the bundled version; never cache Cloudflare IP addresses. */
export async function tunnelEdgeArguments(
  dependencies = {
    srv: () =>
      new Resolver({ timeout: 800, tries: 1 }).resolveSrv(
        '_v2-origintunneld._tcp.argotunnel.com',
      ),
    addresses: (hostname: string) => lookup(hostname, { family: 4, all: true }),
  },
) {
  try {
    if ((await dependencies.srv()).length) return [];
  } catch {
    /* Try the operating system resolver. */
  }
  const edges = await Promise.all(
    ['region1.v2.argotunnel.com', 'region2.v2.argotunnel.com'].map((host) =>
      bounded(dependencies.addresses(host)).catch(() => []),
    ),
  );
  const addresses = [
    ...new Set(
      edges.flatMap((region) => region.slice(0, 2).map((item) => item.address)),
    ),
  ];
  if (!addresses.length)
    throw new Error(
      'Не удалось найти интернет-серверы. Проверь DNS, VPN или подключись через локальную сеть.',
    );
  return [
    '--no-prechecks',
    ...addresses.flatMap((address) => ['--edge', `${address}:7844`]),
  ];
}
