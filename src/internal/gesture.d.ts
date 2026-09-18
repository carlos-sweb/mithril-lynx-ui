// Ambient declaration for the ESM internal/gesture.js.

export type ArenaPolicy = { mode: "claim" } | { mode: "axis-lock"; axis: "horizontal" | "vertical"; referenceMoves?: 0 | 1 };

export function registerGesture(
	node: { setGestureDetector(type: string, arenaPolicy: ArenaPolicy): number; removeGestureDetector(gestureId: number): void },
	type: string,
	arenaPolicy: ArenaPolicy,
): { remove(): void };
