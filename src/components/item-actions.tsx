"use client";
import { useActionState } from "react";
import { changeItemState, type ItemFormState } from "@/app/family/items/actions";
import type { EditorialAction, FamilyItem } from "@/services/editorial";
import { copy } from "@/locales/he";
import { useClientReady } from "./use-client-ready";

// Shows only the actions the item's state allows.
export function ItemActions({ item }: { item: FamilyItem }) {
	const [state, submit, pending] = useActionState(changeItemState, {
		status: "idle",
	} as ItemFormState);
	const ready = useClientReady();
	const actions: [EditorialAction, string][] =
		item.state === "archived"
			? [["restore", copy.items.restore]]
			: [
					...(item.visibility === "private"
						? ([["publish", copy.items.publish]] as [EditorialAction, string][])
						: []),
					...(item.hasUnpublishedEdits
						? ([["publish", copy.items.republish]] as [EditorialAction, string][])
						: []),
					...(item.visibility === "public"
						? ([["make-private", copy.items.makePrivate]] as [EditorialAction, string][])
						: []),
					["archive", copy.items.archive],
				];
	return (
		<div>
			{actions.map(([action, label]) => (
				<form action={submit} key={action}>
					<input type="hidden" name="id" value={item.id} />
					<input type="hidden" name="version" value={item.version} />
					<input type="hidden" name="action" value={action} />
					<button type="submit" disabled={!ready || pending}>
						{label}
					</button>
				</form>
			))}
			<p role="status">
				{state.status === "conflict" && copy.items.conflict}
				{state.status === "failed" && copy.items.failed}
			</p>
		</div>
	);
}
