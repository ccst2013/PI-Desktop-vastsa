/**
 * The signed-in account as it lives on disk.
 *
 * One file, `<dataDir>/account.json`, holding the identity in clear and both
 * credentials as `safeStorage` ciphertext. A stolen file without OS keychain
 * access reveals who signed in and when the session lapses, but not the token
 * that would let someone act as them.
 *
 * The shape follows `remote/remote-host-registry.ts`, which already solved this
 * problem for paired-host device tokens: an injected {@link EncryptionPort}
 * rather than a direct `electron` import, so the module stays unit-testable
 * under `node --test`, and a tmp+rename write so a crash leaves either the old
 * record or the new one, never a torn file.
 *
 * The password is never written here, in any form. It exists only for the
 * duration of one `rememberLogin` call.
 */
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AccountProfile } from "@pi-desktop/shared";

/**
 * Byte-in, byte-out encryption.
 *
 * The same contract `remote/remote-host-registry.ts` declares; duplicated here
 * rather than imported so the account module does not depend on the remote-host
 * domain for one interface. The boot layer wires the real
 * `safeStorage.encryptString` / `safeStorage.decryptString` pair into both.
 */
export interface EncryptionPort {
  isAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(ciphertext: Buffer): string;
}

/** The account as it is persisted. Secrets are base64 ciphertext. */
type SerializedAccount = {
  version: 1;
  username: string;
  /** Base64 of the encrypted session token. */
  encryptedToken: string;
  /**
   * Base64 of the encrypted `GUANYU_REMEMBER` credential. Absent when the user
   * did not ask to be remembered, or when issuance degraded to false.
   */
  encryptedRemember?: string;
  /** Unix seconds, or null when the service reported no lifetime. */
  expiresAt: number | null;
  rememberMe: boolean;
  profile: AccountProfile | null;
  /**
   * True when the secrets above are plaintext because no keychain was
   * available. Recorded so a later launch that does have one can tell the
   * difference between "unencrypted by necessity" and "corrupt".
   */
  unencrypted?: boolean;
};

/** The account in memory, inside the main process only. */
export type StoredAccount = {
  username: string;
  token: string;
  /** The long-lived credential, or null when there is none. */
  rememberCookie: string | null;
  expiresAt: number | null;
  rememberMe: boolean;
  profile: AccountProfile | null;
};

export type CredentialStoreOptions = {
  dataDir: string;
  encryption: EncryptionPort;
  /** File name inside `dataDir`; defaults to `account.json`. */
  fileName?: string;
  /** Optional structured log for I/O and decrypt failures. */
  log?: (level: "warn" | "error", message: string, data?: Record<string, unknown>) => void;
};

export interface CredentialStore {
  /** The stored account, or null when there is none that can be read. */
  read(): Promise<StoredAccount | null>;
  /** Replace the stored account and flush. */
  write(account: StoredAccount): Promise<void>;
  /**
   * Record a rotated credential without touching anything else.
   *
   * The service rotates `GUANYU_REMEMBER` on every automatic sign-in and the
   * old value stops being accepted after a 60-second grace period, so this has
   * to land on disk immediately — not at the next convenient write.
   */
  rotate(rememberCookie: string | null, token?: string | null, expiresAt?: number | null): Promise<void>;
  /** Remove the file. A missing file is a no-op. */
  clear(): Promise<void>;
  /** True when secrets are being written without keychain protection. */
  readonly degraded: boolean;
}

const CURRENT_VERSION = 1;

function fileNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function toBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

function fromBase64(value: string): Buffer {
  return Buffer.from(value, "base64");
}

export function createCredentialStore(options: CredentialStoreOptions): CredentialStore {
  const log = options.log ?? (() => undefined);
  const filePath = join(options.dataDir, options.fileName ?? "account.json");
  const encryption = options.encryption;

  /**
   * Whether secrets go to disk in clear.
   *
   * A Linux session without a keyring has no `safeStorage`. Refusing to
   * remember the account at all would silently drop the user back to the sign-in
   * form on every launch, so the fallback is a `0600` plaintext file plus one
   * warning — the same tradeoff the remote-host registry makes.
   */
  const degraded = !encryption.isAvailable();
  if (degraded) {
    log("warn", "account credentials will be stored without keychain protection");
  }

  const seal = (plaintext: string): string =>
    degraded ? plaintext : toBase64(encryption.encryptString(plaintext));

  const open = (sealed: string): string | null => {
    if (degraded) return sealed;
    try {
      return encryption.decryptString(fromBase64(sealed));
    } catch (error) {
      // A keychain that changed (a restored backup, a new login keychain) makes
      // the ciphertext unreadable. That is a signed-out account, not a crash.
      log("warn", "account credential could not be decrypted", {
        cause: error instanceof Error ? error.name : "unknown",
      });
      return null;
    }
  };

  /** Serialize mutations so two writes cannot interleave a torn read-modify-write. */
  let mutationQueue: Promise<void> = Promise.resolve();
  const serialize = <T>(mutation: () => Promise<T>): Promise<T> => {
    const result = mutationQueue.then(mutation);
    mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const persist = async (file: SerializedAccount): Promise<void> => {
    const tmp = `${filePath}.tmp`;
    await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    // Atomic replace: a crash leaves either the old file or the new one.
    await rename(tmp, filePath);
  };

  const readRaw = async (): Promise<SerializedAccount | null> => {
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (fileNotFound(error)) return null;
      // Unreadable is not absent: the record may exist. Report it and let the
      // caller treat the account as signed out rather than overwriting it.
      log("error", "account.json could not be read", {
        cause: error instanceof Error ? error.name : "unknown",
      });
      return null;
    }

    let parsed: Partial<SerializedAccount>;
    try {
      parsed = JSON.parse(raw) as Partial<SerializedAccount>;
    } catch {
      // Quarantine rather than delete: the bytes may be recoverable by hand.
      const quarantine = `${filePath}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      try {
        await rename(filePath, quarantine);
        log("warn", "quarantined corrupt account.json", { quarantine });
      } catch {
        log("error", "account.json is corrupt and could not be quarantined");
      }
      return null;
    }

    if (parsed.version !== CURRENT_VERSION || typeof parsed.username !== "string") {
      log("warn", "account.json shape rejected", { file: filePath });
      return null;
    }
    return parsed as SerializedAccount;
  };

  const decode = (file: SerializedAccount): StoredAccount | null => {
    const token = typeof file.encryptedToken === "string" ? open(file.encryptedToken) : null;
    if (!token) return null;
    const rememberCookie =
      typeof file.encryptedRemember === "string" ? open(file.encryptedRemember) : null;
    return {
      username: file.username,
      token,
      // A credential that will not decrypt is no credential: the account stays
      // signed in on its session token and simply cannot be restored later.
      rememberCookie,
      expiresAt: typeof file.expiresAt === "number" ? file.expiresAt : null,
      rememberMe: file.rememberMe === true && rememberCookie !== null,
      profile: file.profile ?? null,
    };
  };

  const encode = (account: StoredAccount): SerializedAccount => ({
    version: 1,
    username: account.username,
    encryptedToken: seal(account.token),
    ...(account.rememberCookie
      ? { encryptedRemember: seal(account.rememberCookie) }
      : {}),
    expiresAt: account.expiresAt,
    rememberMe: account.rememberMe && account.rememberCookie !== null,
    profile: account.profile,
    ...(degraded ? { unencrypted: true } : {}),
  });

  return {
    degraded,

    async read() {
      const file = await readRaw();
      if (!file) return null;
      return decode(file);
    },

    async write(account) {
      await serialize(() => persist(encode(account)));
    },

    async rotate(rememberCookie, token, expiresAt) {
      await serialize(async () => {
        const file = await readRaw();
        if (!file) return;
        const next: SerializedAccount = {
          ...file,
          ...(rememberCookie !== null && rememberCookie !== undefined
            ? { encryptedRemember: seal(rememberCookie) }
            : {}),
          ...(typeof token === "string" && token.length > 0
            ? { encryptedToken: seal(token) }
            : {}),
          ...(typeof expiresAt === "number" ? { expiresAt } : {}),
        };
        await persist(next);
      });
    },

    async clear() {
      await serialize(async () => {
        try {
          await unlink(filePath);
        } catch (error) {
          if (!fileNotFound(error)) {
            log("error", "account.json could not be removed", {
              cause: error instanceof Error ? error.name : "unknown",
            });
          }
        }
      });
    },
  };
}
