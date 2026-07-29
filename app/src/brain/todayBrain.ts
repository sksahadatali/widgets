import type {
    FocusData,
    FocusItem,
  } from '../types/focus';
  
  const MAX_FOCUS_ITEMS = 4;
  
  const priorityScore: Record<
    FocusItem['priority'],
    number
  > = {
    high: 3,
    medium: 2,
    low: 1,
  };
  
  function getLocalDateString(date: Date): string {
    const year = date.getFullYear();
  
    const month = String(
      date.getMonth() + 1
    ).padStart(2, '0');
  
    const day = String(
      date.getDate()
    ).padStart(2, '0');
  
    return `${year}-${month}-${day}`;
  }
  
  function isDueToday(
    item: FocusItem,
    today: string
  ): boolean {
    return item.dueDate === today;
  }
  
  function isActive(item: FocusItem): boolean {
    return item.status !== 'completed';
  }
  
  function isEligibleForToday(
    item: FocusItem,
    today: string
  ): boolean {
    return (
      item.status === 'in-progress' ||
      isDueToday(item, today)
    );
  }
  
  function compareFocusItems(
    first: FocusItem,
    second: FocusItem
  ): number {
    const firstInProgress =
      first.status === 'in-progress';
  
    const secondInProgress =
      second.status === 'in-progress';
  
    if (firstInProgress && !secondInProgress) {
      return -1;
    }
  
    if (secondInProgress && !firstInProgress) {
      return 1;
    }
  
    const priorityDifference =
      priorityScore[second.priority] -
      priorityScore[first.priority];
  
    if (priorityDifference !== 0) {
      return priorityDifference;
    }
  
    if (first.dueTime && second.dueTime) {
      return first.dueTime.localeCompare(
        second.dueTime
      );
    }
  
    if (first.dueTime && !second.dueTime) {
      return -1;
    }
  
    if (!first.dueTime && second.dueTime) {
      return 1;
    }
  
    return first.title.localeCompare(
      second.title
    );
  }
  
  export function generateTodayFocus(
    sourceItems: FocusItem[],
    now: Date = new Date()
  ): FocusData {
    const today = getLocalDateString(now);
  
    const items = sourceItems
      .filter(isActive)
      .filter(item =>
        isEligibleForToday(item, today)
      )
      .sort(compareFocusItems)
      .slice(0, MAX_FOCUS_ITEMS);
  
    return {
      items,
      generatedAt: now.toISOString(),
    };
  }