export class ProfileNotFoundError extends Error {
  constructor(message = "Profile not found") {
    super(message);
    this.name = "ProfileNotFoundError";
  }
}

export class IdentityNotOwnedError extends Error {
  constructor(message = "Active identity is not linked to this user") {
    super(message);
    this.name = "IdentityNotOwnedError";
  }
}
