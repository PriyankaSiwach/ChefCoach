/** @typedef {Error & { statusCode: number, headers?: Record<string, string> }} HttpError */

/**
 * @param {number} statusCode
 * @param {string} message
 * @returns {HttpError}
 */
export function httpError(statusCode, message) {
  const e = /** @type {HttpError} */ (new Error(message));
  e.statusCode = statusCode;
  return e;
}
