import { serverEnv } from "@cap/env";
import { userIsPro } from "@cap/utils";

export interface FeatureFlagUser {
	email: string;
	stripeSubscriptionStatus?: string | null;
	thirdPartyStripeSubscriptionId?: string | null;
}

export async function isAiGenerationEnabled(
	user: FeatureFlagUser,
): Promise<boolean> {
	const env = serverEnv();

	if (
		env.CAP_SELF_HOST_DIRECT_VIDEO_PROCESSING &&
		(env.CAP_AI_PROVIDER || env.CAP_OLLAMA_URL)
	) {
		return true;
	}

	return userIsPro(user);
}
