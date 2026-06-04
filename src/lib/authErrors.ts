import type { AuthError } from "@supabase/supabase-js";

export type AuthFailureKind =
  | "account_not_found"
  | "account_exists"
  | "invalid_credentials"
  | "email_not_confirmed"
  | "weak_password"
  | "rate_limited"
  | "generic";

function lower(raw: string) {
  return raw.toLowerCase();
}

export function authErrorCode(error: { code?: string; message?: string } | null): string {
  if (!error?.code) return "";
  return error.code;
}

/** Sign-up: Supabase may return success with empty identities when the email is already registered. */
export function signUpIndicatesExistingAccount(data: {
  user?: { identities?: unknown[] } | null;
}): boolean {
  const identities = data.user?.identities;
  return Array.isArray(identities) && identities.length === 0;
}

export function isAccountExistsAuthError(
  error: AuthError | { message?: string; code?: string }
): boolean {
  const code = error.code ?? "";
  const msg = lower(error.message ?? "");
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    code === "signup_disabled"
  ) {
    return true;
  }
  return (
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("user already") ||
    msg.includes("email address is already")
  );
}

export function classifyLoginAuthError(error: {
  message?: string;
  code?: string;
}): AuthFailureKind {
  const code = error.code ?? "";
  const msg = lower(error.message ?? "");

  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return "email_not_confirmed";
  }
  if (
    code === "user_not_found" ||
    msg.includes("user not found") ||
    msg.includes("no user") ||
    msg.includes("account not found") ||
    msg.includes("does not exist")
  ) {
    return "account_not_found";
  }
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) {
    return "invalid_credentials";
  }
  if (code === "over_request_rate_limit" || msg.includes("rate limit")) {
    return "rate_limited";
  }
  return "generic";
}

export function loginErrorMessage(kind: AuthFailureKind): string {
  switch (kind) {
    case "account_not_found":
      return "No account exists with these credentials. Switch to Sign up to create your first account.";
    case "invalid_credentials":
      return "Incorrect password for this email. Try again or use Forgot password.";
    case "email_not_confirmed":
      return "Confirm your email before logging in. Check your inbox for the confirmation link.";
    case "rate_limited":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export const ACCOUNT_EXISTS_MESSAGE =
  "An account already exists with this email. Log in instead, or use Forgot password if you need to reset it.";

export const SIGNUP_SUCCESS_HINT =
  "Account created! Log in with the email and password you just set.";

export function signupErrorMessage(error: string, code?: string | null): string {
  if (isAccountExistsAuthError({ message: error, code: code ?? undefined })) {
    return ACCOUNT_EXISTS_MESSAGE;
  }
  const msg = lower(error);
  if (code === "weak_password" || msg.includes("password")) {
    return "Choose a stronger password (at least 8 characters).";
  }
  if (msg.includes("valid email") || msg.includes("invalid email")) {
    return "Enter a valid email address.";
  }
  if (code === "over_request_rate_limit" || msg.includes("rate limit")) {
    return "Too many sign-up attempts. Please wait and try again.";
  }
  return error || "Could not create your account. Please try again.";
}
