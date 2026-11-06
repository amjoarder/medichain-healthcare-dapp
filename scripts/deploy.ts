import { artifacts, ethers, network } from 'hardhat';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const [deployer] = await ethers.getSigners();
  const contract = await ethers.deployContract('HealthcareRecords');
  const deployment = contract.deploymentTransaction();
  if (!deployment) throw new Error('Deployment transaction is unavailable.');
  const receipt = await deployment.wait();
  if (!receipt) throw new Error('Deployment receipt is unavailable.');

  const address = await contract.getAddress();
  const providerNetwork = await ethers.provider.getNetwork();
  const artifact = await artifacts.readArtifact('HealthcareRecords');
  const gasPrice = receipt.gasPrice ?? deployment.gasPrice ?? 0n;
  const simulatedCostWei = receipt.gasUsed * gasPrice;
  const deployedAt = new Date().toISOString();

  const frontendConfig = {
    address,
    chainId: Number(providerNetwork.chainId),
    networkName: network.name,
    deploymentBlock: receipt.blockNumber,
    deploymentTransactionHash: receipt.hash,
    deployedAt,
    abi: artifact.abi,
  };

  const deploymentGas = {
    operation: 'HealthcareRecords deployment',
    environment: 'Hardhat local simulated network',
    networkName: network.name,
    chainId: Number(providerNetwork.chainId),
    deployer: deployer.address,
    contractAddress: address,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPriceWei: gasPrice.toString(),
    simulatedTransactionCostWei: simulatedCostWei.toString(),
    simulatedTransactionCostEth: ethers.formatEther(simulatedCostWei),
    realMonetaryCost: 0,
    note: 'Hardhat ETH is simulated. No real ETH or monetary charge was used.',
    measuredAt: deployedAt,
  };

  const frontendDirectory = path.join(process.cwd(), 'frontend', 'src', 'generated');
  const resultsDirectory = path.join(process.cwd(), 'results');
  await mkdir(frontendDirectory, { recursive: true });
  await mkdir(resultsDirectory, { recursive: true });
  await writeFile(
    path.join(frontendDirectory, 'contract.json'),
    `${JSON.stringify(frontendConfig, null, 2)}\n`,
  );
  await writeFile(
    path.join(resultsDirectory, 'deployment-gas.json'),
    `${JSON.stringify(deploymentGas, null, 2)}\n`,
  );

  console.log(`HealthcareRecords deployed to ${address}`);
  console.log(`Deployment gas: ${receipt.gasUsed}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
