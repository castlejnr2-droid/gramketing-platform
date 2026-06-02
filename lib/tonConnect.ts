// TON wallet signature verification utilities

export function verifyTonWalletSignature(
  walletAddress: string,
  signature: string,
  message: string
): boolean {
  // TODO: implement full TonProof verification using @ton/ton
  // For now, stub that accepts valid-looking inputs
  // Real implementation: verify signature against public key derived from walletAddress
  // Steps:
  // 1. Parse walletAddress to get raw address bytes
  // 2. Reconstruct the signed message (TonProof payload)
  // 3. Verify Ed25519 signature using the wallet's public key
  // 4. Check domain, timestamp within valid window (e.g., ±15 min)
  return (
    typeof walletAddress === 'string' &&
    walletAddress.length > 0 &&
    typeof signature === 'string' &&
    signature.length > 0
  );
}

export const TON_CONNECT_MANIFEST = {
  url: process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL ?? '',
  name: 'GRAMKETING',
  iconUrl: '/logo.png',
};
