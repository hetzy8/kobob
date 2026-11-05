"use client";
import { useActionState } from "react";
import { changeItemStatus, type ItemFormState } from "@/app/family/items/actions";
import type { FamilyItem } from "@/services/editorial";
import { copy } from "@/locales/he";
import { useClientReady } from "./use-client-ready";

// Rights and review status are family decisions; the server enforces them.
export function ItemStatusActions({ item }: { item: FamilyItem }) {
	const [state, submit, pending] = useActionState(changeItemStatus, {
		status: "idle",
	} as ItemFormState);
	const ready = useClientReady();
	const cleared = item.rightsStatus === "cleared";
	const reviewed = item.reviewStatus === "reviewed";
	const button = (name: "rights" | "review", value: string, label: string) => (
		<form action={submit}>
			<input type="hidden" name="id" value={item.id} />
			<input type="hidden" name="version" value={item.version} />
			<input type="hidden" name={name} value={value} />
			<button type="submit" disabled={!ready || pending}>
				{label}
			</button>
		</form>
	);
	return (
		<div>
			<p>
				{copy.items.rights}: {copy.items.rightsNames[item.rightsStatus]} ·{" "}
				{copy.items.reviewNames[item.reviewStatus]}
			</p>
			{item.origin === "family" && item.visibility === "public" && cleared && (
				<p>{copy.items.rightsWithdrawWarning}</p>
			)}
			{item.origin === "family" &&
				(cleared
					? button("rights", "needs_clarification", copy.items.undoRightsCleared)
					: button("rights", "cleared", copy.items.markRightsCleared))}
			{reviewed
				? button("review", "needs_review", copy.items.markNeedsReview)
				: button("review", "reviewed", copy.items.markReviewed)}
			<p role="status">
				{state.status === "conflict" && copy.items.conflict}
				{state.status === "failed" && copy.items.failed}
				{state.status === "withdrawn" && copy.items.rightsWithdrawn}
			</p>
		</div>
	);
}
