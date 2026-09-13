/** Literal IPv4 ranges used by home networks and overlay VPNs. */
export function isLocalIPv4(address: string) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) return false;
  const [a, b, c, d] = address.split('.').map(Number);
  if ([a, b, c, d].some((part) => part > 255)) return false;
  return (
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}
