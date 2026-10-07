/**
 * AUTO-GENERATED FILE — do not edit by hand.
 *
 * Produced by `npm run train` (tools/train-model.mjs). Emitted as a TypeScript
 * module rather than JSON so Node's type-stripping loader, esbuild (Worker) and
 * Vite (browser) all consume it identically, with no import attributes.
 */
export const weightsFile = {
  "version": 2,
  "trainedAt": "2026-10-07T05:46:36.211Z",
  "source": "simulated-cohort-v1",
  "sampleSize": 12000,
  "seed": 20261007,
  "provenance": "Trained offline on a seeded generative cohort (no real user data). Per-user calibration is applied at runtime from recorded outcomes.",
  "capacity": {
    "features": [
      "slack",
      "complexity",
      "dependencyDepth",
      "horizon",
      "resourceAdequacy",
      "fragmentation",
      "reliability"
    ],
    "mean": [
      -0.113,
      0.545,
      0.481,
      0.784,
      0.648,
      0.377,
      0.72
    ],
    "std": [
      1.029,
      0.23,
      0.314,
      0.404,
      0.285,
      0.216,
      0.119
    ],
    "models": {
      "success": {
        "weights": [
          1.863,
          -0.075,
          0.001,
          0.005,
          0.044,
          -0.065,
          0.038
        ],
        "bias": 0.532
      },
      "deadlineMiss": {
        "weights": [
          -1.884,
          0.149,
          0.065,
          -0.086,
          -0.118,
          0.247,
          0.004
        ],
        "bias": 0.01
      }
    }
  },
  "stress": {
    "features": [
      "slack",
      "complexity",
      "dependencyDepth",
      "horizon",
      "resourceAdequacy",
      "fragmentation",
      "reliability",
      "utilization"
    ],
    "mean": [
      -0.113,
      0.545,
      0.481,
      0.784,
      0.648,
      0.377,
      0.72,
      0.821
    ],
    "std": [
      1.029,
      0.23,
      0.314,
      0.404,
      0.285,
      0.216,
      0.119,
      0.13
    ],
    "model": {
      "weights": [
        0.006,
        0.042,
        0.026,
        -0.004,
        -0.034,
        0.034,
        -0.002,
        0.038
      ],
      "bias": 0.497
    }
  },
  "metrics": {
    "success": {
      "accuracy": 0.793,
      "brier": 0.146,
      "auc": 0.865,
      "positives": 2106
    },
    "deadlineMiss": {
      "accuracy": 0.788,
      "brier": 0.145,
      "auc": 0.872,
      "positives": 1833
    },
    "stress": {
      "mae": 0.042,
      "r2": 0.708
    }
  },
  "prior": {
    "successRate": 0.59,
    "deadlineMissRate": 0.493,
    "meanStress": 0.497
  }
} as const
