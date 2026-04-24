export function isPathExcluded(
  path: string | undefined,
  patterns: Array<string | RegExp> = [],
): boolean {
  if (!path) {
    return false;
  }

  return patterns.some((pattern) => {
    if (typeof pattern === "string") {
      return path.startsWith(pattern);
    }

    return pattern.test(path);
  });
}
