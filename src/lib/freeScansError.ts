/** The server answered 402: this free user has used all free scans of this kind. */
export type FreeScanKind = "cook" | "track";

export const FREE_SCANS_USED_MESSAGE = "You've used your free scans. Upgrade to Pro for unlimited scans.";

export class FreeScansUsedError extends Error {
  readonly kind: FreeScanKind;

  constructor(kind: FreeScanKind, message = FREE_SCANS_USED_MESSAGE) {
    super(message);
    this.name = "FreeScansUsedError";
    this.kind = kind;
  }
}

/** Build the error from a 402 response, keeping the server's message when it has one. */
export async function freeScansUsedFrom(res: Response, kind: FreeScanKind): Promise<FreeScansUsedError> {
  try {
    const data = (await res.clone().json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error.trim()) return new FreeScansUsedError(kind, data.error);
  } catch {
    /* fall through */
  }
  return new FreeScansUsedError(kind);
}
