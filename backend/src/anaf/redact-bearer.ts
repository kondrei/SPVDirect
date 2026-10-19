export const redactBearerTokens = (text: string): string =>
  text.replace(/\bBearer\s+[^\s\]",;]+/gi, 'Bearer [ascuns]');
