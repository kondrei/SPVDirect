export const redactBearerTokens = (text: string): string =>
  text.replaceAll(/\bBearer\s+[^\s\]",;]+/gi, 'Bearer [ascuns]');
