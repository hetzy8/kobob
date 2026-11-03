"use client";
import { useActionState, useState } from "react";
import { addPerson, addPlace, saveItem, type ItemFormState } from "@/app/family/items/actions";
import type { RevisionView } from "@/services/item-view";
import { itemTypes } from "@/services/item-input";
import { formatDate } from "@/lib/format-date";
import { copy } from "@/locales/he";
import { RecordPicker } from "./record-picker";
import { submitWithoutReset } from "./submit-without-reset";
import { useClientReady } from "./use-client-ready";

type Option = { id: string; name: string };
const empty: RevisionView = {
	title: "",
	description: "",
	types: [],
	date: { kind: "unknown" },
	tags: [],
	people: [],
	places: [],
};

// Every field lives in React state, so a conflict or a failed save never
// clears what the member typed; submitWithoutReset keeps React's post-action
// form reset from reverting checkboxes in the DOM.
export function ItemForm({
	id,
	version,
	initial = empty,
	people,
	places,
}: {
	id?: string;
	version?: number;
	initial?: RevisionView;
	people: Option[];
	places: Option[];
}) {
	const [state, submit, pending] = useActionState(saveItem, {
		status: "idle",
		version,
	} as ItemFormState);
	const ready = useClientReady();
	const [title, setTitle] = useState(initial.title);
	const [description, setDescription] = useState(initial.description);
	const [types, setTypes] = useState<string[]>(initial.types);
	const [dateKind, setDateKind] = useState(initial.date.kind);
	const [dateStart, setDateStart] = useState(initial.date.kind === "unknown" ? "" : initial.date.start);
	const [dateEnd, setDateEnd] = useState(initial.date.kind === "range" ? initial.date.end : "");
	const [precision, setPrecision] = useState(
		initial.date.kind === "unknown" ? "year" : initial.date.precision,
	);
	const [approximate, setApproximate] = useState(
		initial.date.kind === "unknown" ? false : initial.date.approximate,
	);
	const [tags, setTags] = useState(initial.tags.join(", "));
	const [personIds, setPersonIds] = useState(initial.people.map((p) => p.id));
	const [placeIds, setPlaceIds] = useState(initial.places.map((p) => p.id));
	// Versions only grow, so the highest one known is current: the page prop
	// (refreshed after lifecycle actions), the last save, or the conflict's
	// latest version (the next save then deliberately targets it).
	const known = [version, state.version, state.latest?.version].filter(
		(value): value is number => value !== undefined,
	);
	const currentVersion = known.length ? Math.max(...known) : undefined;
	const invalid = (field: string) => state.status === "invalid" && state.fields?.includes(field);
	return (
		<form onSubmit={submitWithoutReset(submit)}>
			{id && <input type="hidden" name="id" value={id} />}
			{currentVersion !== undefined && (
				<input type="hidden" name="version" value={currentVersion} />
			)}
			<label>
				{copy.items.title}
				<input
					name="title"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					required
					maxLength={200}
					aria-invalid={invalid("title")}
				/>
			</label>
			<label>
				{copy.items.description}
				<textarea
					name="description"
					value={description}
					onChange={(event) => setDescription(event.target.value)}
					maxLength={20000}
					rows={8}
				/>
			</label>
			<fieldset aria-invalid={invalid("types")}>
				<legend>{copy.items.types}</legend>
				{itemTypes.map((type) => (
					<label key={type}>
						<input
							type="checkbox"
							name="types"
							value={type}
							checked={types.includes(type)}
							onChange={(event) =>
								setTypes(
									event.target.checked ? [...types, type] : types.filter((t) => t !== type),
								)
							}
						/>
						{copy.items.typeNames[type]}
					</label>
				))}
			</fieldset>
			<fieldset aria-invalid={invalid("date")}>
				<legend>{copy.items.date}</legend>
				<select
					name="dateKind"
					value={dateKind}
					onChange={(event) => setDateKind(event.target.value as typeof dateKind)}
				>
					{(["unknown", "single", "range"] as const).map((kind) => (
						<option key={kind} value={kind}>
							{copy.items.dateKinds[kind]}
						</option>
					))}
				</select>
				{dateKind !== "unknown" && (
					<>
						<label>
							{copy.items.dateStart}
							<input
								type="date"
								name="dateStart"
								value={dateStart}
								onChange={(event) => setDateStart(event.target.value)}
								required
							/>
						</label>
						{dateKind === "range" && (
							<label>
								{copy.items.dateEnd}
								<input
									type="date"
									name="dateEnd"
									value={dateEnd}
									onChange={(event) => setDateEnd(event.target.value)}
									required
								/>
							</label>
						)}
						<label>
							{copy.items.precision}
							<select
								name="datePrecision"
								value={precision}
								onChange={(event) => setPrecision(event.target.value as typeof precision)}
							>
								{(["day", "month", "year", "decade"] as const).map((value) => (
									<option key={value} value={value}>
										{copy.items.precisions[value]}
									</option>
								))}
							</select>
						</label>
						<label>
							<input
								type="checkbox"
								name="dateApproximate"
								checked={approximate}
								onChange={(event) => setApproximate(event.target.checked)}
							/>
							{copy.items.approximate}
						</label>
					</>
				)}
			</fieldset>
			<label>
				{copy.items.tags}
				<input name="tags" value={tags} onChange={(event) => setTags(event.target.value)} />
			</label>
			<RecordPicker
				label={copy.items.people}
				name="personIds"
				options={people}
				selected={personIds}
				onSelectedChange={setPersonIds}
				create={addPerson}
			/>
			<RecordPicker
				label={copy.items.places}
				name="placeIds"
				options={places}
				selected={placeIds}
				onSelectedChange={setPlaceIds}
				create={addPlace}
			/>
			<button type="submit" disabled={!ready || pending}>
				{copy.items.save}
			</button>
			<p role="status">
				{state.status === "saved" && copy.items.saved}
				{state.status === "invalid" && copy.items.invalid}
				{state.status === "conflict" && copy.items.conflict}
				{state.status === "failed" && copy.items.failed}
			</p>
			{state.status === "conflict" && state.latest && (
				<aside aria-label={copy.items.latest}>
					<h2>{copy.items.latest}</h2>
					<p>{state.latest.working.title}</p>
					<p>{formatDate(state.latest.working.date)}</p>
					<p>{state.latest.working.description}</p>
				</aside>
			)}
		</form>
	);
}
