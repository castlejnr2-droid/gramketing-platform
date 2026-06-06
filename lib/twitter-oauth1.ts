/**
 * OAuth 1.0a signing helper for Twitter/X API.
 *
 * Implements the HMAC-SHA1 signature method as specified in RFC 5849.
 * Used for the three-legged OAuth 1.0a flow (request_token → authorize → access_token).
 */

import { createHmac, randomBytes } from 'crypto';

/** Percent-encode a string per RFC 5849 §3.6 (stricter than encodeURIComponent). */
function pct(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g,  '%21')
    .replace(/'/g,  '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

/**
 * Build an OAuth 1.0a Authorization header value.
 *
 * Pass all OAuth-level parameters explicitly; the function handles nonce,
 * timestamp, signing, and header serialisation.
 *
 * @param method         HTTP method (GET | POST)
 * @param url            Request URL - no query string
 * @param consumerKey    App consumer key (TWITTER_CONSUMER_KEY)
 * @param consumerSecret App consumer secret (TWITTER_CONSUMER_SECRET)
 * @param oauthToken     Per-request or per-user token (omit when requesting a request_token)
 * @param tokenSecret    Secret matching oauthToken (omit when requesting a request_token)
 * @param oauthCallback  Callback URL - include only in the request_token call
 * @param oauthVerifier  Verifier - include only in the access_token call
 */
export function buildOAuth1Header({
  method,
  url,
  consumerKey,
  consumerSecret,
  oauthToken    = '',
  tokenSecret   = '',
  oauthCallback = '',
  oauthVerifier = '',
}: {
  method:         string;
  url:            string;
  consumerKey:    string;
  consumerSecret: string;
  oauthToken?:    string;
  tokenSecret?:   string;
  oauthCallback?: string;
  oauthVerifier?: string;
}): string {
  const nonce     = randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Collect all OAuth params that will appear in the header
  const p: Record<string, string> = {
    oauth_consumer_key:     consumerKey,
    oauth_nonce:            nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        timestamp,
    oauth_version:          '1.0',
  };
  if (oauthToken)    p.oauth_token    = oauthToken;
  if (oauthCallback) p.oauth_callback = oauthCallback;
  if (oauthVerifier) p.oauth_verifier = oauthVerifier;

  // Build the normalised parameter string (sorted, percent-encoded)
  const paramStr = Object.keys(p)
    .sort()
    .map((k) => `${pct(k)}=${pct(p[k])}`)
    .join('&');

  // Signature base string
  const base = [method.toUpperCase(), pct(url), pct(paramStr)].join('&');

  // Signing key = percent_encode(consumer_secret) & percent_encode(token_secret)
  const signingKey = `${pct(consumerSecret)}&${pct(tokenSecret)}`;

  p.oauth_signature = createHmac('sha1', signingKey).update(base).digest('base64');

  // Serialise to Authorization header value
  return (
    'OAuth ' +
    Object.keys(p)
      .sort()
      .map((k) => `${pct(k)}="${pct(p[k])}"`)
      .join(', ')
  );
}
