import Link from "next/link";

/**
 * The two ways into the same reports: the links that produced them, and the
 * per client inbox that reads them all together. Chips rather than a nav entry,
 * because this is a change of question inside Demo, not another section.
 */
export function DemoTabs({ current }: { current: "links" | "cambios" }) {
  return (
    <div className="filter-chips">
      <Link href="/lab/demo" className={`chip${current === "links" ? " active" : ""}`}>
        Links
      </Link>
      <Link href="/lab/demo/cambios" className={`chip${current === "cambios" ? " active" : ""}`}>
        Cambios
      </Link>
    </div>
  );
}
