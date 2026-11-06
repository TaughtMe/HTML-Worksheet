// Keep the original policy intact. Strict is a second, intersecting policy, never a replacement.
export const childPolicy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export const strictChildPolicy = (nonce: string) => `script-src 'nonce-${nonce}'; style-src 'none'; img-src 'none'`;
