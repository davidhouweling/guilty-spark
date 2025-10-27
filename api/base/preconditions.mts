export const Preconditions = {
  checkExists<T>(value: T, errorMessage?: string): NonNullable<T> {
    if (value === null || value === undefined) {
      throw new Error(errorMessage ?? "Value cannot be null");
    }

    return value;
  },
};
