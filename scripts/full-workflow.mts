import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Contract, ContractFactory, JsonRpcProvider } from 'ethers';
import { addBytes, catBytes } from '../frontend/src/lib/ipfs/client.ts';
import { createVault, unlockVault } from '../frontend/src/lib/crypto/vault.ts';
import {
  createKeyEnvelope,
  openKeyEnvelope,
  parseKeyEnvelope,
  serializeKeyEnvelope,
} from '../frontend/src/lib/crypto/envelopes.ts';
import {
  decryptFile,
  encryptFile,
  parseEncryptedPayload,
  serializeEncryptedPayload,
  sha256Hex,
} from '../frontend/src/lib/crypto/fileCrypto.ts';
import { envelopeContext, recordFromContract } from '../frontend/src/lib/records/service.ts';

const provider = new JsonRpcProvider('http://127.0.0.1:8545');
const [admin, patient, doctor, hospital, outsider] = await Promise.all(
  [0, 1, 2, 4, 6].map((index) => provider.getSigner(index)),
);
const artifact = JSON.parse(
  await readFile('artifacts/contracts/HealthcareRecords.sol/HealthcareRecords.json', 'utf8'),
);
const transactionHashes: string[] = [];
const timings: Record<string, number> = {};

async function confirmed(transactionPromise: Promise<unknown>) {
  const transaction = (await transactionPromise) as { hash: string; wait(): Promise<unknown> };
  transactionHashes.push(transaction.hash);
  return transaction.wait();
}

async function timed<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const result = await operation();
  timings[name] = Number((performance.now() - started).toFixed(3));
  return result;
}

const factory = new ContractFactory(artifact.abi, artifact.bytecode, admin);
const contract = await factory.deploy();
const deploymentTransaction = contract.deploymentTransaction();
assert(deploymentTransaction);
const deploymentReceipt = await deploymentTransaction.wait();
assert(deploymentReceipt);
transactionHashes.push(deploymentReceipt.hash);
const contractAddress = await contract.getAddress();

const patientAddress = await patient.getAddress();
const doctorAddress = await doctor.getAddress();
const hospitalAddress = await hospital.getAddress();
const outsiderAddress = await outsider.getAddress();

const patientVault = await createVault(patientAddress, (message) => patient.signMessage(message));
const doctorVault = await createVault(doctorAddress, (message) => doctor.signMessage(message));
const hospitalVault = await createVault(hospitalAddress, (message) =>
  hospital.signMessage(message),
);

await confirmed(
  contract
    .connect(patient)
    .registerPatient('Demo Patient', JSON.stringify(patientVault.publicKeyJwk)),
);
await confirmed(
  contract
    .connect(doctor)
    .registerDoctor(
      'Dr. Demo',
      'Cardiology',
      'DEMO-MED-1001',
      JSON.stringify(doctorVault.publicKeyJwk),
    ),
);
await confirmed(
  contract
    .connect(hospital)
    .registerHospital(
      'Demonstration General Hospital',
      'DEMO-HOSP-2001',
      JSON.stringify(hospitalVault.publicKeyJwk),
    ),
);
await confirmed(contract.connect(admin).approveDoctor(doctorAddress));
await confirmed(contract.connect(admin).approveHospital(hospitalAddress));

const original = new TextEncoder().encode(
  'DEMONSTRATION DATA - NOT REAL MEDICAL DATA\nSynthetic E2E blood test result.',
);
const encrypted = await timed('encryptionMs', () => encryptFile(original));
const serialized = serializeEncryptedPayload(encrypted);
const ciphertextHash = await sha256Hex(serialized);
const encryptedFile = await timed('ipfsUploadMs', () =>
  addBytes(serialized, 'e2e-encrypted-record.mch'),
);
const ownerEnvelope = await createKeyEnvelope(
  encrypted.key,
  patientVault.publicKeyJwk,
  envelopeContext(ciphertextHash, patientAddress),
);
const storedOwnerEnvelope = await addBytes(
  serializeKeyEnvelope(ownerEnvelope),
  'e2e-owner-envelope.json',
);
await timed('recordTransactionMs', () =>
  confirmed(
    contract
      .connect(patient)
      .addMedicalRecord('Blood Test', encryptedFile.cid, ciphertextHash, storedOwnerEnvelope.cid),
  ),
);

const outsiderContract = contract.connect(outsider) as Contract;
const initialUnauthorizedAccessDenied = !(await contract.hasAccess(1n, outsiderAddress));
await assert.rejects(() => outsiderContract.getRecord(1n));

const patientPrivate = await unlockVault(patientVault, patientAddress, (message) =>
  patient.signMessage(message),
);
const ownerEnvelopeBytes = await catBytes(storedOwnerEnvelope.cid);
const recoveredDataKey = await openKeyEnvelope(
  parseKeyEnvelope(ownerEnvelopeBytes),
  patientPrivate,
  envelopeContext(ciphertextHash, patientAddress),
);
assert.deepEqual(recoveredDataKey, encrypted.key);

const doctorEnvelope = await createKeyEnvelope(
  recoveredDataKey,
  doctorVault.publicKeyJwk,
  envelopeContext(ciphertextHash, doctorAddress),
);
const storedDoctorEnvelope = await addBytes(
  serializeKeyEnvelope(doctorEnvelope),
  'e2e-doctor-envelope.json',
);
await timed('permissionGrantMs', () =>
  confirmed(contract.connect(patient).grantPermission(1n, doctorAddress, storedDoctorEnvelope.cid)),
);
assert.equal(await contract.hasAccess(1n, doctorAddress), true);

await confirmed(contract.connect(doctor).logRecordAccess(1n));
const doctorRecord = recordFromContract(await contract.connect(doctor).getRecord(1n));
const doctorEnvelopeCid = (await contract.connect(doctor).getEnvelopeCid(1n)) as string;
const doctorPrivate = await unlockVault(doctorVault, doctorAddress, (message) =>
  doctor.signMessage(message),
);
const doctorDataKey = await openKeyEnvelope(
  parseKeyEnvelope(await catBytes(doctorEnvelopeCid)),
  doctorPrivate,
  envelopeContext(doctorRecord.ciphertextHash, doctorAddress),
);
const retrievedCiphertext = await timed('ipfsDownloadMs', () =>
  catBytes(doctorRecord.encryptedFileCid),
);
assert.equal(await sha256Hex(retrievedCiphertext), ciphertextHash);
const decrypted = await timed('decryptionMs', () =>
  decryptFile(parseEncryptedPayload(retrievedCiphertext), doctorDataKey),
);
const authorizedDecryptionMatchesOriginal = Buffer.from(decrypted).equals(Buffer.from(original));
assert.equal(authorizedDecryptionMatchesOriginal, true);

await timed('permissionRevokeMs', () =>
  confirmed(contract.connect(patient).revokePermission(1n, doctorAddress)),
);
const revokedAccessDenied = !(await contract.hasAccess(1n, doctorAddress));
await assert.rejects(() => contract.connect(doctor).getRecord(1n));

const logs = await provider.getLogs({
  address: contractAddress,
  fromBlock: deploymentReceipt.blockNumber,
  toBlock: 'latest',
});

const output = {
  status: 'PASS',
  environment: 'Hardhat local network + Kubo local offline node',
  measuredAt: new Date().toISOString(),
  contractAddress,
  encryptedFileCid: encryptedFile.cid,
  ownerEnvelopeCid: storedOwnerEnvelope.cid,
  doctorEnvelopeCid: storedDoctorEnvelope.cid,
  ciphertextHash,
  initialUnauthorizedAccessDenied,
  authorizedDecryptionMatchesOriginal,
  revokedAccessDenied,
  auditEventCount: logs.length,
  transactionHashes,
  timingsMs: timings,
  transferredBytes: {
    original: original.length,
    encryptedObject: serialized.length,
    downloadedEncryptedObject: retrievedCiphertext.length,
  },
};
await writeFile('results/e2e-workflow.json', `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
