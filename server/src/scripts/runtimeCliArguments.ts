export function parseArguments(
  allowed: readonly string[],
): Record<string, string | true> {
  const result: Record<string, string | true> = {};
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!name.startsWith('--') || !allowed.includes(name) || name in result) {
      throw new Error(`Unknown or duplicated option: ${name}`);
    }
    if (name.startsWith('--confirm-')) {
      result[name] = true;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}.`);
    result[name] = value;
    index += 1;
  }
  return result;
}

export function requiredOption(
  values: Record<string, string | true>,
  name: string,
): string {
  const value = values[name];
  if (typeof value !== 'string') throw new Error(`Provide ${name} <absolute-path>.`);
  return value;
}
