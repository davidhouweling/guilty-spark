import type { Quantum3 } from "../../positions/types";

// quanta are anisotropic per axis, which cancels on a single-axis map and is tolerated elsewhere
export class FlagAxis {
  private readonly direction: Quantum3;
  private readonly squaredLength: number;

  constructor(
    private readonly stand: Quantum3,
    capturePoint: Quantum3,
  ) {
    this.direction = [capturePoint[0] - stand[0], capturePoint[1] - stand[1], capturePoint[2] - stand[2]];
    this.squaredLength = this.direction[0] ** 2 + this.direction[1] ** 2 + this.direction[2] ** 2;
  }

  get isDegenerate(): boolean {
    return this.squaredLength === 0;
  }

  progressOf(position: Quantum3): number {
    if (this.isDegenerate) {
      return 0;
    }
    const along =
      (position[0] - this.stand[0]) * this.direction[0] +
      (position[1] - this.stand[1]) * this.direction[1] +
      (position[2] - this.stand[2]) * this.direction[2];
    return Math.min(1, Math.max(0, along / this.squaredLength));
  }
}

export function medianPosition(positions: readonly Quantum3[]): Quantum3 | null {
  const [first] = positions;
  if (first == null) {
    return null;
  }
  const middle = (axis: 0 | 1 | 2): number => {
    const sorted = positions.map((position) => position[axis]).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? first[axis];
  };
  return [middle(0), middle(1), middle(2)];
}
