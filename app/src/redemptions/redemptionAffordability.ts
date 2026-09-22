export function canAffordReward(
  availableBalance: number,
  starCost: number
): boolean {
  return availableBalance >= starCost;
}
