export const Preconditions = {
  checkExists<T>(value: T): NonNullable<T> {
    if (value == null) {
      throw new Error("Value cannot be null");
    }

    return value;
  },
};
