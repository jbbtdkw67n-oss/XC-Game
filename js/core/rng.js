/*
 * Seeded pseudo-random number generator (mulberry32) plus helpers.
 * Using a seeded RNG means a given dynasty seed always generates the
 * same world, and lets us keep world generation deterministic/testable.
 */
(function () {
  class SeededRNG {
    constructor(seed) {
      this.seed = (seed >>> 0) || 0xC0FFEE;
    }

    // Returns a float in [0, 1)
    next() {
      let t = (this.seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // Integer in [min, max] inclusive
    int(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    }

    // Float in [min, max)
    float(min, max) {
      return this.next() * (max - min) + min;
    }

    bool(probability = 0.5) {
      return this.next() < probability;
    }

    choice(arr) {
      if (!arr || arr.length === 0) return undefined;
      return arr[this.int(0, arr.length - 1)];
    }

    // Pick according to relative weights, weightFn(item) -> number
    weightedChoice(arr, weightFn) {
      const weights = arr.map(weightFn);
      const total = weights.reduce((a, b) => a + b, 0);
      if (total <= 0) return this.choice(arr);
      let r = this.next() * total;
      for (let i = 0; i < arr.length; i++) {
        r -= weights[i];
        if (r <= 0) return arr[i];
      }
      return arr[arr.length - 1];
    }

    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = this.int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }

    // Approximate normal distribution via Box-Muller, clamped
    gaussian(mean = 0, stdev = 1) {
      let u = 0, v = 0;
      while (u === 0) u = this.next();
      while (v === 0) v = this.next();
      const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
      return z * stdev + mean;
    }

    // Normal distribution clamped to [min, max]
    gaussianRange(mean, stdev, min, max) {
      return Math.max(min, Math.min(max, Math.round(this.gaussian(mean, stdev))));
    }
  }

  window.XCD.core.SeededRNG = SeededRNG;
})();
