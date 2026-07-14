export function normalizeEmptyContentEditable(root: HTMLElement): boolean {
	if (
		root.childNodes.length === 0 ||
		(root.textContent?.length ?? 0) > 0 ||
		root.querySelector("[data-provider]")
	) {
		return false;
	}

	root.replaceChildren();
	return true;
}
