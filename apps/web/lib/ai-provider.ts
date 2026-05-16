import { serverEnv } from "@cap/env";

export type AiProvider = "groq" | "openai" | "ollama";

export function getAiProvider(): AiProvider | null {
	const env = serverEnv();

	if (env.CAP_AI_PROVIDER === "groq") {
		return env.GROQ_API_KEY ? "groq" : null;
	}

	if (env.CAP_AI_PROVIDER === "openai") {
		return env.OPENAI_API_KEY ? "openai" : null;
	}

	if (env.CAP_AI_PROVIDER === "ollama") {
		return env.CAP_OLLAMA_URL ? "ollama" : null;
	}

	if (env.CAP_OLLAMA_URL) {
		return "ollama";
	}

	if (env.GROQ_API_KEY) {
		return "groq";
	}

	if (env.OPENAI_API_KEY) {
		return "openai";
	}

	return null;
}
