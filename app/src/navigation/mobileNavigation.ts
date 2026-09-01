export function createNavigationSelectionHandler(
  onNavigate?: () => void
) {
  return () => onNavigate?.();
}
