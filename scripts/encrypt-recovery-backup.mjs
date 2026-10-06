import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, mkdtemp, link, unlink, rmdir } from 'node:fs/promises';
import { Writable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAGIC = Buffer.from('NASUNBK1');
const HEADER_SIZE = MAGIC.length + 32 + 12;
const TAG_SIZE = 16;
const deriveKey = (password, salt) => pbkdf2Sync(password, salt, 200000, 32, 'sha256');

async function readEnvelope(handle, password) {
  const { size } = await handle.stat();
  if (size <= HEADER_SIZE + TAG_SIZE) throw new Error('INVALID_BACKUP_SIZE');
  const header = Buffer.alloc(HEADER_SIZE);
  const tag = Buffer.alloc(TAG_SIZE);
  const headerRead = await handle.read(header, 0, header.length, 0);
  const tagRead = await handle.read(tag, 0, tag.length, size - TAG_SIZE);
  if (headerRead.bytesRead !== header.length || tagRead.bytesRead !== tag.length) throw new Error('INVALID_BACKUP_SIZE');
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('INVALID_BACKUP_FORMAT');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(password, header.subarray(8, 40)), header.subarray(40));
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  return { size, decipher };
}

export async function verifyEncryptedBackup(path, password) {
  const handle = await open(path, 'r');
  try {
    const { size, decipher } = await readEnvelope(handle, password);
    const digest = createHash('sha256');
    let bytes = 0;
    await pipeline(handle.createReadStream({ start: HEADER_SIZE, end: size - TAG_SIZE - 1, autoClose: false }), decipher,
      new Writable({ write(chunk, _encoding, callback) { bytes += chunk.length; digest.update(chunk); callback(); } }));
    return { bytes, sha256: digest.digest('hex') };
  } finally { await handle.close(); }
}

export async function encryptRecoveryBackup(input, output, password) {
  if (typeof password !== 'string' || password.length < 24) throw new Error('BACKUP_PASSPHRASE_REQUIRED');
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const header = Buffer.concat([MAGIC, salt, iv]);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(password, salt), iv);
  cipher.setAAD(header);
  const outputStream = createWriteStream(output, { flags: 'wx', mode: 0o600 });
  outputStream.write(header);
  const sourceHash = createHash('sha256');
  const hashSource = new Transform({ transform(chunk, _encoding, callback) {
    sourceHash.update(chunk);
    callback(null, chunk);
  } });
  await pipeline(createReadStream(input), hashSource, cipher, outputStream, { end: false });
  await new Promise((resolveWrite, rejectWrite) => {
    outputStream.once('error', rejectWrite);
    outputStream.end(cipher.getAuthTag(), resolveWrite);
  });
  const verified = await verifyEncryptedBackup(output, password);
  if (verified.sha256 !== sourceHash.digest('hex')) throw new Error('BACKUP_ROUNDTRIP_FAILED');
  return verified;
}

export async function decryptRecoveryBackup(input, output, password) {
  const handle = await open(input, 'r');
  let stagingDirectory;
  let stagedOutput;
  try {
    const { size, decipher } = await readEnvelope(handle, password);
    stagingDirectory = await mkdtemp(join(dirname(resolve(output)), '.nasun-restore-'));
    stagedOutput = join(stagingDirectory, 'payload');
    await pipeline(handle.createReadStream({ start: HEADER_SIZE, end: size - TAG_SIZE - 1, autoClose: false }), decipher,
      createWriteStream(stagedOutput, { flags: 'wx', mode: 0o600 }));
    // Publish only authenticated plaintext; linking never overwrites an existing destination.
    await link(stagedOutput, output);
  } finally {
    await handle.close();
    if (stagedOutput) await unlink(stagedOutput).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (stagingDirectory) await rmdir(stagingDirectory);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const decrypt = process.argv[2] === '--decrypt';
  const operation = decrypt
    ? decryptRecoveryBackup(process.argv[3], process.argv[4], process.env.BACKUP_ENCRYPTION_PASSPHRASE)
    : encryptRecoveryBackup(process.argv[2], process.argv[3], process.env.BACKUP_ENCRYPTION_PASSPHRASE);
  operation
    .then(() => console.log(decrypt ? 'Recovery archive decrypted after authentication verification.' : 'Recovery archive encrypted and authenticated roundtrip verified.'))
    .catch(() => { console.error('Recovery archive encryption or verification failed.'); process.exitCode = 1; });
}
