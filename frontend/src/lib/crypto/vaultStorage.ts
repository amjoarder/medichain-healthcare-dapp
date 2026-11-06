import type { VaultBundle } from './types';

export function vaultStorageKey(chainId: number, address: string): string {
  return `medichain:vault:v1:${chainId}:${address.toLowerCase()}`;
}

export function saveVault(chainId: number, address: string, vault: VaultBundle): void {
  localStorage.setItem(vaultStorageKey(chainId, address), JSON.stringify(vault));
}

export function loadVault(chainId: number, address: string): VaultBundle | null {
  const stored = localStorage.getItem(vaultStorageKey(chainId, address));
  if (!stored) return null;
  const vault = JSON.parse(stored) as VaultBundle;
  if (vault.version !== 1) throw new Error('Unsupported local encryption vault version.');
  return vault;
}
