const SHARED_PREFIX = "@shared/";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(SHARED_PREFIX)) {
    const relativePath = specifier.slice(SHARED_PREFIX.length);
    return {
      url: new URL(`../dist-server/shared/${relativePath}`, import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
