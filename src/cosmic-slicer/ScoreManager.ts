import { CosmicObjectType } from './types';

export type ScoreChangeEvent =
  | { type: 'reset' }
  | {
      type: 'scoreChanged';
      delta: number;
      reason: 'slice' | 'miss' | 'combo' | 'boss';
      objectType?: CosmicObjectType;
    }
  | { type: 'levelChanged'; previousLevel: number; newLevel: number };

export interface ScoreState {
  score: number;
  level: number;
  progressToNextLevel01: number;
  pointsToNextLevel: number | null;
  nextLevelThresholdScore: number | null;
  speedMultiplier: number;
}

export interface ScoreManagerConfig {
  pointsByType: Record<CosmicObjectType, number>;
  missPenaltyByType?: Partial<Record<CosmicObjectType, number>>;

  maxLevel?: number;
  pointsToNextLevel?: (level: number) => number;
  speedMultiplierForLevel?: (level: number) => number;
}

export type ScoreListener = (
  state: ScoreState,
  event: ScoreChangeEvent
) => void;

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const defaultPointsToNextLevel = (level: number): number => {
  const safeLevel = Math.max(1, Math.floor(level));
  const k = safeLevel - 1;
  const base = 70 + 25 * k + 12 * k * k;
  return Math.max(60, Math.round(base));
};

const defaultSpeedMultiplierForLevel = (level: number): number => {
  const l = Math.max(1, Math.floor(level));
  const k = l - 1;
  const raw = 1 + 0.06 * k + 0.0025 * k * k;
  return clamp(raw, 1, 2.75);
};

export class ScoreManager {
  private readonly pointsByType: Record<CosmicObjectType, number>;
  private readonly missPenaltyByType?: Partial<
    Record<CosmicObjectType, number>
  >;

  private readonly maxLevel: number;
  private readonly pointsToNextLevel: (level: number) => number;
  private readonly speedMultiplierForLevel: (level: number) => number;

  private score: number = 0;
  private level: number = 1;
  private listeners: Set<ScoreListener> = new Set();

  private levelThresholds: number[] = [0];

  constructor(config: ScoreManagerConfig) {
    this.pointsByType = config.pointsByType;
    this.missPenaltyByType = config.missPenaltyByType;

    this.maxLevel = clampInt(config.maxLevel ?? 50, 1, 200);
    this.pointsToNextLevel =
      config.pointsToNextLevel ?? defaultPointsToNextLevel;
    this.speedMultiplierForLevel =
      config.speedMultiplierForLevel ?? defaultSpeedMultiplierForLevel;

    this.ensureThresholdsUpTo(this.maxLevel);
  }

  addListener(listener: ScoreListener): () => void {
    this.listeners.add(listener);
    listener(this.getState(), { type: 'reset' });
    return () => {
      this.listeners.delete(listener);
    };
  }

  getScore(): number {
    return this.score;
  }

  getLevel(): number {
    return this.level;
  }

  reset(): void {
    const prevLevel = this.level;
    this.score = 0;
    this.level = 1;

    this.emit(this.getState(), { type: 'reset' });

    if (prevLevel !== this.level) {
      this.emit(this.getState(), {
        type: 'levelChanged',
        previousLevel: prevLevel,
        newLevel: this.level,
      });
    }
  }

  applySlice(objectType: CosmicObjectType): number {
    const delta = this.pointsByType[objectType] ?? 0;
    return this.applyScoreDelta(delta, 'slice', objectType);
  }

  applyMiss(objectType: CosmicObjectType): number {
    const penalty =
      this.missPenaltyByType?.[objectType] ??
      this.pointsByType[objectType] ??
      0;
    return this.applyScoreDelta(-Math.abs(penalty), 'miss', objectType);
  }

  applyBonus(delta: number, reason: 'combo' | 'boss'): number {
    return this.applyScoreDelta(delta, reason);
  }

  private applyScoreDelta(
    delta: number,
    reason: 'slice' | 'miss' | 'combo' | 'boss',
    objectType?: CosmicObjectType
  ): number {
    if (!Number.isFinite(delta) || delta === 0) return 0;

    const prevScore = this.score;
    const prevLevel = this.level;

    const nextScore = Math.max(0, Math.floor(prevScore + delta));
    this.score = nextScore;
    this.level = this.computeLevelForScore(nextScore);

    const appliedDelta = this.score - prevScore;
    if (appliedDelta !== 0) {
      this.emit(this.getState(), {
        type: 'scoreChanged',
        delta: appliedDelta,
        reason,
        objectType,
      });
    }

    if (this.level !== prevLevel) {
      this.emit(this.getState(), {
        type: 'levelChanged',
        previousLevel: prevLevel,
        newLevel: this.level,
      });
    }

    return appliedDelta;
  }

  private computeLevelForScore(score: number): number {
    this.ensureThresholdsUpTo(this.maxLevel);

    let l = 1;
    for (let next = 2; next <= this.maxLevel; next++) {
      const threshold = this.levelThresholds[next] ?? Number.POSITIVE_INFINITY;
      if (score >= threshold) {
        l = next;
      } else {
        break;
      }
    }
    return l;
  }

  private ensureThresholdsUpTo(level: number): void {
    if (this.levelThresholds.length > level) return;

    for (let l = this.levelThresholds.length; l <= level; l++) {
      if (l === 1) {
        this.levelThresholds[1] = 0;
        continue;
      }
      const prevThreshold = this.levelThresholds[l - 1] ?? 0;
      const points = this.pointsToNextLevel(l - 1);
      this.levelThresholds[l] = prevThreshold + Math.max(1, Math.floor(points));
    }
  }

  private getState(): ScoreState {
    const threshold = this.levelThresholds[this.level] ?? 0;

    if (this.level >= this.maxLevel) {
      return {
        score: this.score,
        level: this.level,
        progressToNextLevel01: 1,
        pointsToNextLevel: null,
        nextLevelThresholdScore: null,
        speedMultiplier: this.speedMultiplierForLevel(this.level),
      };
    }

    const nextThreshold = this.levelThresholds[this.level + 1] ?? null;
    const span = nextThreshold !== null ? nextThreshold - threshold : 0;
    const progress = span > 0 ? (this.score - threshold) / span : 0;

    return {
      score: this.score,
      level: this.level,
      progressToNextLevel01: clamp(progress, 0, 1),
      pointsToNextLevel:
        nextThreshold !== null ? Math.max(0, nextThreshold - this.score) : null,
      nextLevelThresholdScore: nextThreshold,
      speedMultiplier: this.speedMultiplierForLevel(this.level),
    };
  }

  private emit(state: ScoreState, event: ScoreChangeEvent): void {
    for (const listener of this.listeners) {
      listener(state, event);
    }
  }
}
