import { realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

// True when the report would land outside the repository, after resolving symlinks
// and filesystem case. Throws if the parent directory does not exist. The native
// realpath returns the on-disk case, so a differently-cased path compares equal;
// the plain JS realpath does not.
export function isOutsideRepository(reportPath: string, repositoryRoot: string): boolean {
	const parent = realpathSync.native(dirname(resolve(reportPath)));
	const root = realpathSync.native(repositoryRoot);
	const fromRoot = relative(root, parent);
	if (fromRoot === "") return false;
	return fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot);
}
