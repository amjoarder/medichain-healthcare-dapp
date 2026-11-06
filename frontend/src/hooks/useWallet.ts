import { BrowserProvider, Contract, type JsonRpcSigner } from 'ethers';
import { useCallback, useEffect, useState } from 'react';
import contractConfig from '../generated/contract.json';

export const HARDHAT_CHAIN_ID = 31337;
const HARDHAT_CHAIN_ID_HEX = '0x7a69';

function walletErrorCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || !error || !('code' in error)) return undefined;
  return typeof error.code === 'number' ? error.code : Number(error.code);
}

export async function ensureHardhatNetwork(
  ethereum: Pick<EthereumProvider, 'request'>,
): Promise<void> {
  const switchRequest = {
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: HARDHAT_CHAIN_ID_HEX }],
  };

  try {
    await ethereum.request(switchRequest);
  } catch (error) {
    if (walletErrorCode(error) !== 4902) throw error;
    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: HARDHAT_CHAIN_ID_HEX,
          chainName: 'Hardhat Local',
          nativeCurrency: { name: 'Hardhat ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['http://127.0.0.1:8545'],
        },
      ],
    });
    await ethereum.request(switchRequest);
  }
}

export interface WalletState {
  account: string;
  chainId: number | null;
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  contract: Contract | null;
  role: number;
  connecting: boolean;
  error: string;
  connect(): Promise<void>;
  disconnect(): void;
  refreshRole(): Promise<void>;
  switchNetwork(): Promise<void>;
}

function messageFor(error: unknown): string {
  if (typeof error === 'object' && error && 'code' in error && error.code === 4001) {
    return 'The wallet request was rejected. No changes were made.';
  }
  return error instanceof Error ? error.message : 'Unexpected wallet error.';
}

export function useWallet(): WalletState {
  const [account, setAccount] = useState('');
  const [chainId, setChainId] = useState<number | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [role, setRole] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const hydrate = useCallback(async (requestedAccount?: string) => {
    if (!window.ethereum) {
      throw new Error('MetaMask or another compatible wallet is required to use this DApp.');
    }
    const nextProvider = new BrowserProvider(window.ethereum as never, 'any');
    const nextSigner = requestedAccount
      ? await nextProvider.getSigner(requestedAccount)
      : await nextProvider.getSigner();
    const nextAccount = await nextSigner.getAddress();
    const network = await nextProvider.getNetwork();
    const nextContract = new Contract(contractConfig.address, contractConfig.abi, nextSigner);
    setProvider(nextProvider);
    setSigner(nextSigner);
    setAccount(nextAccount);
    setChainId(Number(network.chainId));
    setContract(nextContract);
    setRole(Number(await nextContract.getRole(nextAccount)));
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError('');
    try {
      if (!window.ethereum) {
        throw new Error('MetaMask or another compatible wallet is required to use this DApp.');
      }
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];
      await hydrate(accounts[0]);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setConnecting(false);
    }
  }, [hydrate]);

  const disconnect = useCallback(() => {
    setAccount('');
    setChainId(null);
    setProvider(null);
    setSigner(null);
    setContract(null);
    setRole(0);
    setError('');
  }, []);

  const refreshRole = useCallback(async () => {
    if (contract && account) setRole(Number(await contract.getRole(account)));
  }, [account, contract]);

  const switchNetwork = useCallback(async () => {
    if (!window.ethereum) return;
    setError('');
    try {
      await ensureHardhatNetwork(window.ethereum);
      await hydrate(account || undefined);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, [account, hydrate]);

  useEffect(() => {
    if (!window.ethereum?.on) return;
    const accountsChanged = (...values: unknown[]) => {
      const accounts = values[0] as string[];
      if (!accounts?.length) disconnect();
      else void hydrate(accounts[0]).catch((caught) => setError(messageFor(caught)));
    };
    const chainChanged = () =>
      void hydrate(account || undefined).catch((caught) => setError(messageFor(caught)));
    window.ethereum.on('accountsChanged', accountsChanged);
    window.ethereum.on('chainChanged', chainChanged);
    return () => {
      window.ethereum?.removeListener?.('accountsChanged', accountsChanged);
      window.ethereum?.removeListener?.('chainChanged', chainChanged);
    };
  }, [account, disconnect, hydrate]);

  return {
    account,
    chainId,
    provider,
    signer,
    contract,
    role,
    connecting,
    error,
    connect,
    disconnect,
    refreshRole,
    switchNetwork,
  };
}
