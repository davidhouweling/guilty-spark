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

export class TrackerLimitReachedError extends Error {
  constructor(message = "Tracker limit reached") {
    super(message);
    this.name = "TrackerLimitReachedError";
  }
}

export class TrackerNotFoundError extends Error {
  constructor(message = "Tracker not found") {
    super(message);
    this.name = "TrackerNotFoundError";
  }
}

export class NoActiveSeriesError extends Error {
  constructor(message = "No active series") {
    super(message);
    this.name = "NoActiveSeriesError";
  }
}

export class NoCompletedSeriesError extends Error {
  constructor(message = "No completed series to resume") {
    super(message);
    this.name = "NoCompletedSeriesError";
  }
}

export class ActiveSeriesExistsError extends Error {
  constructor(message = "Active series already exists") {
    super(message);
    this.name = "ActiveSeriesExistsError";
  }
}
