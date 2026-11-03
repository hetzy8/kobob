"use client";
import { useState } from "react";
import { copy } from "@/locales/he";
import { useClientReady } from "./use-client-ready";

type Option = { id: string; name: string };

// Search-and-add picker. Selected ids are submitted as repeated hidden inputs
// named `name`; "add" creates the record through the given server action.
export function RecordPicker({
	label,
	name,
	options: initialOptions,
	selected,
	onSelectedChange,
	create,
}: {
	label: string;
	name: string;
	options: Option[];
	selected: string[];
	onSelectedChange: (ids: string[]) => void;
	create: (name: string) => Promise<Option | null>;
}) {
	const ready = useClientReady();
	const [options, setOptions] = useState(initialOptions);
	const [query, setQuery] = useState("");
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);
	const needle = query.trim();
	const matches = options.filter(
		(option) => !selected.includes(option.id) && option.name.includes(needle),
	);
	async function add() {
		setBusy(true);
		setFailed(false);
		try {
			const created = await create(needle);
			if (!created) {
				setFailed(true);
				return;
			}
			setOptions((current) => [...current, created]);
			onSelectedChange([...selected, created.id]);
			setQuery("");
		} catch {
			setFailed(true);
		} finally {
			setBusy(false);
		}
	}
	return (
		<fieldset>
			<legend>{label}</legend>
			{selected.map((id) => (
				<input key={id} type="hidden" name={name} value={id} />
			))}
			<ul>
				{selected.map((id) => (
					<li key={id}>
						{options.find((option) => option.id === id)?.name}{" "}
						<button
							type="button"
							onClick={() => onSelectedChange(selected.filter((value) => value !== id))}
						>
							×
						</button>
					</li>
				))}
			</ul>
			<label>
				{copy.items.search}
				<input value={query} onChange={(event) => setQuery(event.target.value)} />
			</label>
			{needle && (
				<ul>
					{matches.slice(0, 10).map((option) => (
						<li key={option.id}>
							<button
								type="button"
								onClick={() => {
									onSelectedChange([...selected, option.id]);
									setQuery("");
								}}
							>
								{option.name}
							</button>
						</li>
					))}
				</ul>
			)}
			{needle && !options.some((option) => option.name === needle) && (
				<button type="button" onClick={add} disabled={!ready || busy}>
					{copy.items.addNew}: {needle}
				</button>
			)}
			<p role="status">{failed && copy.items.failed}</p>
		</fieldset>
	);
}
