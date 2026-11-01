"use client";
import { useEffect, useState } from "react";
// An SSR button must not accept input before its client event handler is attached.
export function useClientReady() {
	const [ready, setReady] = useState(false);
	useEffect(() => {
		setReady(true);
	}, []);
	return ready;
}
