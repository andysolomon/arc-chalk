export function clerkIsConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY &&
    import.meta.env.VITE_CONVEX_URL,
  );
}
