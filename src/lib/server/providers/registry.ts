import { Github } from "./github";
import { Ollama } from "./ollama";
import type { Provider } from "./provider";

const providers: Record<string, () => Provider> = {
  ollama: () => new Ollama(),
  github: () => new Github(),
};

export function getProviders(): Provider[] {
  return Object.values(providers).map((provider) => provider());
}

export function getProvider(provider: string): Provider {
  const createProvider = providers[provider];

  if (!createProvider) throw new Error("no provider found");

  return createProvider();
}
