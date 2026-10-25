import { createHash } from "node:crypto";

/**
 * Deterministic seeded PRNG (SplitMix32 / Mulberry32) so BLA builds can be
 * 100% reproducible given a seed while producing high-entropy decoy identifiers,
 * bogus constants, and opaque predicate coefficients.
 */
export class SeededPrng {
  #state: number;
  readonly seedString: string;

  constructor(seed: string | number = "bla-default-seed-v1") {
    this.seedString = String(seed);
    const digest = createHash("sha256").update(this.seedString).digest();
    this.#state = digest.readUInt32LE(0) ^ digest.readUInt32LE(4) ^ 0x9e3779b9;
    if (this.#state === 0) this.#state = 0x6d2b79f5;
  }

  nextUint32(): number {
    let t = (this.#state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  nextInt(minInclusive: number, maxInclusive: number): number {
    if (maxInclusive <= minInclusive) return minInclusive;
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + (this.nextUint32() % span);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty array");
    }
    return items[this.nextInt(0, items.length - 1)]!;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const tmp = copy[i]!;
      copy[i] = copy[j]!;
      copy[j] = tmp;
    }
    return copy;
  }

  hex(length: number): string {
    const chars = "0123456789abcdef";
    let out = "";
    for (let i = 0; i < length; i++) {
      out += chars[this.nextUint32() & 0x0f];
    }
    return out;
  }

  identifier(prefix = "_bla"): string {
    return `${prefix}_${this.hex(6)}`;
  }
}
