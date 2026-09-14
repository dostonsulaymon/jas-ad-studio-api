/**
 * True when browsers reach this API over HTTPS from the public internet.
 *
 * The live stack runs NODE_ENV=development behind the tunnel, so NODE_ENV alone cannot
 * decide what is safe to expose. WEB_ORIGIN can: it is https exactly when the site is public.
 */
export function isPublicDeployment(nodeEnv: string, webOrigin: string): boolean {
  return nodeEnv === 'production' || new URL(webOrigin).protocol === 'https:';
}
