import "server-only";
import { readEmailConfig } from "./config";

type Message = { email: string; url: string };
type Deliver = (message: Message) => Promise<void>;
// Chooses how sign-in links are delivered. Live mail only in production with
// valid settings; development and tests never build the provider client.
// Delivery is scheduled after the response (`schedule`, which is Next's
// `after` in the app) so a member's request takes as long as a non-member's:
// response time must not reveal membership. A failed or timed-out delivery is
// logged by the sender as codes; the unused link then simply expires (15 min).
export function createLinkSender({
	env,
	schedule,
	makeSender,
}: {
	env: Record<string, string | undefined>;
	schedule: (task: () => Promise<void>) => void;
	makeSender: (config: { apiKey: string; from: string }) => Deliver;
}): Deliver {
	if (env.NODE_ENV === "production") {
		try {
			const deliver = makeSender(readEmailConfig(env));
			return async (message) => {
				schedule(async () => {
					try {
						await deliver(message);
					} catch {
						console.error("[email] sign-in link not delivered");
					}
				});
			};
		} catch {
			console.error("[email] delivery not configured");
		}
	}
	return async () => {
		throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");
	};
}
