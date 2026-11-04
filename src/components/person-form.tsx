"use client";
import { useActionState, useState } from "react";
import { savePersonForm, type ItemFormState } from "@/app/family/items/actions";
import type { PersonRecord } from "@/services/editorial";
import { copy } from "@/locales/he";
import { submitWithoutReset } from "./submit-without-reset";
import { useClientReady } from "./use-client-ready";
import { listOf, type Snapshot, useFormBase } from "./use-form-base";

type Content = { name: string; otherNames: string[]; familyOnly: boolean };
const content = (name: string, otherNames: string, familyOnly: boolean): Content => ({
	name: name.trim(),
	otherNames: listOf(otherNames),
	familyOnly,
});
const snapshot = (person?: PersonRecord): Snapshot<Content> | undefined =>
	person && {
		version: person.version,
		content: content(person.name, person.otherNames.join(", "), person.familyOnly),
	};

export function PersonForm({ person }: { person?: PersonRecord }) {
	const [state, submit, pending] = useActionState(savePersonForm, { status: "idle" } as ItemFormState);
	const ready = useClientReady();
	const latest = state.status === "conflict" ? state.latestPerson : undefined;
	const [name, setName] = useState(person?.name ?? "");
	const [otherNames, setOtherNames] = useState(person?.otherNames.join(", ") ?? "");
	const [familyOnly, setFamilyOnly] = useState(person?.familyOnly ?? false);
	const { version, remember } = useFormBase({
		loaded: snapshot(person),
		current: content(name, otherNames, familyOnly),
		state,
		latest: snapshot(latest),
		load: (loaded) => {
			setName(loaded.name);
			setOtherNames(loaded.otherNames.join(", "));
			setFamilyOnly(loaded.familyOnly);
		},
	});
	const [handled, setHandled] = useState(state);
	if (handled !== state) {
		setHandled(state);
		if (!person && state.status === "saved") {
			setName("");
			setOtherNames("");
			setFamilyOnly(false);
		}
		// The privacy switch must show the newest decision after a conflict;
		// the member re-ticks it on purpose if they want to change it.
		// Skipped when this render also loaded newer props than the latest.
		if (latest && (version ?? 0) <= latest.version) setFamilyOnly(latest.familyOnly);
	}
	return (
		<form
			onSubmit={submitWithoutReset((data) => {
				remember();
				submit(data);
			})}
		>
			{person && <input type="hidden" name="id" value={person.id} />}
			{person && <input type="hidden" name="version" value={version} />}
			<label>
				{copy.items.name}
				<input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
			</label>
			<label>
				{copy.items.otherNames}
				<input name="otherNames" value={otherNames} onChange={(e) => setOtherNames(e.target.value)} />
			</label>
			<label>
				<input
					type="checkbox"
					name="familyOnly"
					checked={familyOnly}
					onChange={(e) => setFamilyOnly(e.target.checked)}
				/>
				{copy.items.familyOnly}
			</label>
			<button type="submit" disabled={!ready || pending}>
				{person ? copy.items.save : copy.items.addNew}
			</button>
			<p role="status">
				{state.status === "saved" && copy.items.saved}
				{state.status === "invalid" && copy.items.invalid}
				{state.status === "conflict" && copy.items.conflict}
				{state.status === "failed" && copy.items.failed}
			</p>
			{latest && (
				<aside aria-label={copy.items.latest}>
					<h2>{copy.items.latest}</h2>
					<p>{latest.name}</p>
					<p>{latest.otherNames.join(", ")}</p>
					{latest.familyOnly && <p>{copy.items.familyOnly}</p>}
				</aside>
			)}
		</form>
	);
}
