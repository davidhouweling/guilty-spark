/**
 * Thrown when a profile is not found or the user doesn't own it
 */
export class ProfileNotFoundError extends Error {
  constructor(message = "Profile not found") {
    super(message);
    this.name = "ProfileNotFoundError";
  }
}

/**
 * Thrown when game reorder validation fails (ids don't match existing games)
 */
export class InvalidReorderError extends Error {
  constructor(message = "Invalid reorder payload") {
    super(message);
    this.name = "InvalidReorderError";
  }
}
