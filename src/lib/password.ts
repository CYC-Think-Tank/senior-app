export const PASSWORD_MIN_LENGTH = 8;

export function validateNewPassword(password: string) {
  return password.length >= PASSWORD_MIN_LENGTH
    ? null
    : `Use at least ${PASSWORD_MIN_LENGTH} characters for your password.`;
}
