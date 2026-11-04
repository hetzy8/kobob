"use client";
import { useActionState, useState } from "react";
import {
	addPerson,
	addPlace,
	saveItem,
	type ItemFormState,
} from "@/app/family/items/actions";
import type { RevisionView } from "@/services/item-view";
import { type DateValue, itemTypes } from "@/services/item-input";
import { formatDate } from "@/lib/format-date";
import { copy } from "@/locales/he";
import { RecordPicker } from "./record-picker";
import { submitWithoutReset } from "./submit-without-reset";
import { useClientReady } from "./use-client-ready";
import { listOf, useFormBase } from "./use-form-base";

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

// What the form edits, in the shape the server stores it (see itemInputSchema).
type Content = {
	title: string;
	description: string;
	types: string[];
	date: DateValue;
	tags: string[];
	personIds: string[];
	placeIds: string[];
};
const fromView = (view: RevisionView): Content => ({
	title: view.title,
	description: view.description,
	types: view.types,
	date: view.date,
	tags: view.tags,
	personIds: view.people.map((p) => p.id),
	placeIds: view.places.map((p) => p.id),
});
function fields({ date, ...rest }: Content) {
	return {
		title: rest.title,
		description: rest.description,
		types: rest.types,
		dateKind: date.kind,
		dateStart: date.kind === "unknown" ? "" : date.start,
		dateEnd: date.kind === "range" ? date.end : "",
		precision: date.kind === "unknown" ? ("year" as const) : date.precision,
		approximate: date.kind === "unknown" ? false : date.approximate,
		tags: rest.tags.join(", "),
		personIds: rest.personIds,
		placeIds: rest.placeIds,
	};
}
type Fields = ReturnType<typeof fields>;
function content(f: Fields): Content {
	const date: DateValue =
		f.dateKind === "single"
			? {
					kind: "single",
					start: f.dateStart,
					precision: f.precision,
					approximate: f.approximate,
				}
			: f.dateKind === "range"
				? {
						kind: "range",
						start: f.dateStart,
						end: f.dateEnd,
						precision: f.precision,
						approximate: f.approximate,
					}
				: { kind: "unknown" };
	return {
		title: f.title.trim(),
		description: f.description,
		types: itemTypes.filter((type) => f.types.includes(type)),
		date,
		tags: listOf(f.tags),
		personIds: [...new Set(f.personIds)],
		placeIds: [...new Set(f.placeIds)],
	};
}

// Every field lives in React state, so a conflict or a failed save never
// clears what the member typed; submitWithoutReset keeps React's post-action
// form reset from reverting checkboxes in the DOM. useFormBase keeps the
// posted version tied to the values the form loaded.
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
	const start = fields(fromView(initial));
	const [title, setTitle] = useState(start.title);
	const [description, setDescription] = useState(start.description);
	const [types, setTypes] = useState<string[]>(start.types);
	const [dateKind, setDateKind] = useState(start.dateKind);
	const [dateStart, setDateStart] = useState(start.dateStart);
	const [dateEnd, setDateEnd] = useState(start.dateEnd);
	const [precision, setPrecision] = useState(start.precision);
	const [approximate, setApproximate] = useState(start.approximate);
	const [tags, setTags] = useState(start.tags);
	const [personIds, setPersonIds] = useState(start.personIds);
	const [placeIds, setPlaceIds] = useState(start.placeIds);
	const current = {
		title,
		description,
		types,
		dateKind,
		dateStart,
		dateEnd,
		precision,
		approximate,
		tags,
		personIds,
		placeIds,
	};
	const { version: currentVersion, remember } = useFormBase({
		loaded:
			version === undefined ? undefined : { version, content: content(start) },
		current: content(current),
		state,
		latest: state.latest && {
			version: state.latest.version,
			content: content(fields(fromView(state.latest.working))),
		},
		load: (loaded) => {
			const next = fields(loaded);
			setTitle(next.title);
			setDescription(next.description);
			setTypes(next.types);
			setDateKind(next.dateKind);
			setDateStart(next.dateStart);
			setDateEnd(next.dateEnd);
			setPrecision(next.precision);
			setApproximate(next.approximate);
			setTags(next.tags);
			setPersonIds(next.personIds);
			setPlaceIds(next.placeIds);
		},
	});
	const invalid = (field: string) =>
		state.status === "invalid" && state.fields?.includes(field);
	return (
		<form
			onSubmit={submitWithoutReset((data) => {
				remember();
				submit(data);
			})}
		>
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
									event.target.checked
										? [...types, type]
										: types.filter((t) => t !== type),
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
					onChange={(event) =>
						setDateKind(event.target.value as typeof dateKind)
					}
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
								onChange={(event) =>
									setPrecision(event.target.value as typeof precision)
								}
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
				<input
					name="tags"
					value={tags}
					onChange={(event) => setTags(event.target.value)}
				/>
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
					<p>
						{copy.items.types}:{" "}
						{state.latest.working.types
							.map((type) => copy.items.typeNames[type])
							.join(", ")}
					</p>
					<p>
						{copy.items.tags}: {state.latest.working.tags.join(", ")}
					</p>
					<p>
						{copy.items.people}:{" "}
						{state.latest.working.people.map((p) => p.name).join(", ")}
					</p>
					<p>
						{copy.items.places}:{" "}
						{state.latest.working.places.map((p) => p.name).join(", ")}
					</p>
				</aside>
			)}
		</form>
	);
}
