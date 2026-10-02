import type { TUI } from "@earendil-works/pi-tui";

// fullscreen 选区接口为宿主内部方法；仅在该接口存在的实例上优化。
type Point = { row: number; col: number; boundary?: boolean; scrollView?: { scrollTop: number } };
type Rect = { x: number; y: number; width: number; height: number };
type LayoutBox = { rect: Rect; clip: Rect; scrollView?: Point["scrollView"]; children: LayoutBox[] };
type Layout = { root: LayoutBox };
type SelectionHost = {
	terminal: { columns: number };
	currentLayout?: Layout;
	getSelectionBounds(): { start: Point; end: Point } | undefined;
	applySelection(screen: string[], layout?: Layout): string[];
};
type CachedRow = { line: string; key: string; rendered: string };
type Installation = { users: number; restore: () => void };
const installations = new WeakMap<object, Installation>();

function releaseSelection(host: SelectionHost, installation: Installation): () => void {
	let released = false;
	return () => {
		if (released) return;
		released = true;
		if (--installation.users === 0) {
			installation.restore();
			installations.delete(host);
		}
	};
}

function findScrollBox(box: LayoutBox, scrollView: Point["scrollView"]): LayoutBox | undefined {
	if (box.scrollView === scrollView) return box;
	for (const child of box.children) {
		const found = findScrollBox(child, scrollView);
		if (found) return found;
	}
	return undefined;
}

export function cacheFullscreenSelection(tui: TUI): () => void {
	const host = tui as unknown as SelectionHost;
	if (typeof host.applySelection !== "function" || typeof host.getSelectionBounds !== "function") {
		return () => {};
	}
	const existing = installations.get(host);
	if (existing) {
		existing.users++;
		return releaseSelection(host, existing);
	}
	const original = host.applySelection;
	const hadOwn = Object.hasOwn(host, "applySelection");
	let rows: CachedRow[] = [];
	const wrapped: SelectionHost["applySelection"] = function (screen, layout = host.currentLayout) {
		const selection = host.getSelectionBounds();
		if (!selection) return original.call(host, screen, layout);
		const { start, end } = selection;
		const box = start.scrollView && layout ? findScrollBox(layout.root, start.scrollView) : undefined;
		if (start.scrollView && !box) return original.call(host, screen, layout);
		const rowOffset = box ? box.rect.y - start.scrollView!.scrollTop : 0;
		const startRow = start.row + rowOffset;
		const endRow = end.row + rowOffset;
		const columnOffset = box?.rect.x ?? 0;
		const clipKey = box
			? `${box.rect.x},${box.rect.width},${box.clip.x},${box.clip.width},${box.rect.y},${box.rect.height},${box.clip.y},${box.clip.height}`
			: "";
		const keys = screen.map((_, row) => {
			if (row < startRow || row > endRow) return "outside";
			return `${host.terminal.columns};${clipKey};${row === startRow ? start.col + columnOffset : "all"};${row === endRow ? `${end.col + columnOffset},${Boolean(end.boundary)}` : "all"}`;
		});
		const hits = screen.map((line, row) => rows[row]?.line === line && rows[row]?.key === keys[row]);
		if (hits.every(Boolean)) return screen.map((_, row) => rows[row]!.rendered);
		// 原方法仍处理坐标、宽字符及反色；缓存命中的行用空串跳过昂贵 ANSI 切片。
		const rendered = original.call(host, screen.map((line, row) => hits[row] ? "" : line), layout);
		rows = screen.map((line, row) => ({
			line,
			key: keys[row]!,
			rendered: hits[row] ? rows[row]!.rendered : rendered[row]!,
		}));
		return rows.map((row) => row.rendered);
	};
	host.applySelection = wrapped;
	const installation: Installation = {
		users: 1,
		restore: () => {
			if (host.applySelection === wrapped) {
				if (hadOwn) host.applySelection = original;
				else delete (host as Partial<SelectionHost>).applySelection;
			}
			rows = [];
		},
	};
	installations.set(host, installation);
	return releaseSelection(host, installation);
}
