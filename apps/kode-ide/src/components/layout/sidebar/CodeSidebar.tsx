import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
} from "lucide-react";

type Node = {
  name: string;
  type: "folder" | "file";
  children?: Node[];
};

const tree: Node[] = [
  {
    name: "src",
    type: "folder",
    children: [
      {
        name: "components",
        type: "folder",
        children: [
          { name: "Form.tsx", type: "file" },
          { name: "Button.tsx", type: "file" },
        ],
      },
      { name: "index.ts", type: "file" },
      { name: "utils.ts", type: "file" },
    ],
  },
  { name: "package.json", type: "file" },
  { name: "README.md", type: "file" },
];

function TreeNode({ node, depth }: { node: Node; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const pad = 8 + depth * 14;

  if (node.type === "folder") {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ paddingLeft: pad }}
          className="flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-[12.5px] text-foreground/75 transition-colors hover:bg-white/[0.04] hover:text-foreground"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {open ? (
            <FolderOpen size={13} className="text-brand" />
          ) : (
            <Folder size={13} className="text-foreground/45" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {open &&
          node.children?.map((c) => (
            <TreeNode key={c.name} node={c} depth={depth + 1} />
          ))}
      </div>
    );
  }

  const FileIcon = node.name.endsWith(".md") ? FileText : FileCode;
  return (
    <button
      type="button"
      style={{ paddingLeft: pad + 16 }}
      className="flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-[12.5px] text-foreground/65 transition-colors hover:bg-white/[0.04] hover:text-foreground"
    >
      <FileIcon size={13} className="shrink-0 text-foreground/40" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

const CodeSidebar = () => {
  return (
    <div className="flex h-full flex-col pt-2">
      <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/40">
        Explorer
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {tree.map((n) => (
          <TreeNode key={n.name} node={n} depth={0} />
        ))}
      </div>
    </div>
  );
};

export default CodeSidebar;
