"use client";
import { useState } from "react";
import type { ItemFormState } from "@/app/family/items/actions";

// The version a form posts must be the version of the values it loaded or
// showed as latest. Every server action re-renders the page, so the props
// carry newer versions while the fields keep older values; posting the
// newer version would overwrite someone else's change without a conflict.
export type Snapshot<C> = { version: number; content: C };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Comma-separated input as the server stores it: trimmed, non-empty, unique.
export const listOf = (value: string) => [
	...new Set(
		value
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean),
	),
];

// `loaded` and `current` are the props' and the form's values in the same
// canonical shape; `load` puts canonical values into the fields. Returns the
// version to post and `remember`, to call when the form submits.
export function useFormBase<C>({
	loaded,
	current,
	state,
	latest,
	load,
}: {
	loaded?: Snapshot<C>;
	current: C;
	state: ItemFormState;
	latest?: Snapshot<C>;
	load: (content: C) => void;
}) {
	const [base, setBase] = useState(loaded);
	const [seen, setSeen] = useState(loaded?.version);
	const [handled, setHandled] = useState(state);
	const [submitted, setSubmitted] = useState<C>();
	let next = base;
	if (handled !== state) {
		setHandled(state);
		if (next && state.status === "saved" && state.version !== undefined)
			next = { version: state.version, content: submitted ?? current };
		// The member saves over the latest on purpose with the next save.
		if (next && state.status === "conflict" && latest) next = latest;
	}
	if (loaded && loaded.version !== seen) {
		setSeen(loaded.version);
		if (next && loaded.version > next.version) {
			if (same(loaded.content, next.content)) next = { ...next, version: loaded.version };
			else if (same(current, next.content)) {
				load(loaded.content);
				next = loaded;
			}
			// Otherwise keep the old version: the next save conflicts and shows
			// the latest beside the member's input.
		}
	}
	if (next !== base) setBase(next);
	return { version: next?.version, remember: () => setSubmitted(current) };
}
