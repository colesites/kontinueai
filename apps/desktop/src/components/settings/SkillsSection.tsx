import { useMemo, useState } from "react";
import {
  ChevronRight,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useSkills } from "@/hooks/use-skills";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import {
  createUserSkill,
  deleteUserSkill,
  getDisabledSkills,
  listSkillFiles,
  readSkillFile,
  setSkillDisabled,
  type KodeSkill,
  type SkillFile,
} from "@/lib/kode-skills";
import { readInstalledRegistry, type InstalledSkillMeta } from "@/lib/kode-marketplace";
import { cn } from "@/lib/utils";
import { DiscoverSkills } from "./DiscoverSkills";

function scopeBadge(scope: KodeSkill["scope"]) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-1.5 py-px text-micro",
        scope === "project"
          ? "border-purple-500/30 text-purple-500"
          : "border-black/10 text-muted-foreground dark:border-white/10",
      )}
    >
      {scope}
    </span>
  );
}

export function SkillsSection() {
  const { projects, chats, activeChatId, draftProjectId } = useKodeWorkspace();
  const projectRoot = useMemo(() => {
    const activeProjectId =
      (activeChatId ? chats.find((chat) => chat.id === activeChatId)?.projectId : draftProjectId) ?? null;
    return projects.find((project) => project.id === activeProjectId)?.path ?? null;
  }, [projects, chats, activeChatId, draftProjectId]);

  const { skills, reload, loading } = useSkills(projectRoot);
  const [disabled, setDisabled] = useState<Set<string>>(() => new Set(getDisabledSkills()));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, SkillFile[]>>({});
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", body: "" });
  const [error, setError] = useState<string | null>(null);

  const toggle = (name: string) => {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      setSkillDisabled(name, next.has(name));
      return next;
    });
  };

  const toggleExpand = async (skill: KodeSkill) => {
    if (expanded === skill.name) {
      setExpanded(null);
      return;
    }
    setExpanded(skill.name);
    setFileContent(null);
    if (!files[skill.name]) {
      const list = await listSkillFiles(skill, projectRoot);
      setFiles((prev) => ({ ...prev, [skill.name]: list }));
    }
  };

  const viewFile = async (skill: KodeSkill, path: string) => {
    try {
      setFileContent(await readSkillFile(skill, projectRoot, path));
    } catch (err) {
      setFileContent(`Could not read ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const removeSkill = async (skill: KodeSkill) => {
    if (skill.scope !== "user") return;
    if (!confirm(`Delete the skill "${skill.name}"?`)) return;
    try {
      await deleteUserSkill(skill.dir);
      setFiles((prev) => {
        const next = { ...prev };
        delete next[skill.name];
        return next;
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const submitCreate = async () => {
    setError(null);
    const name = draft.name.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      setError("Name must be lowercase letters, digits, and dashes.");
      return;
    }
    if (!draft.description.trim() || !draft.body.trim()) {
      setError("Description and instructions are required.");
      return;
    }
    try {
      await createUserSkill({ name, description: draft.description, body: draft.body });
      setDraft({ name: "", description: "", body: "" });
      setCreating(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const userSkills = skills.filter((s) => s.scope === "user");
  const projectSkills = skills.filter((s) => s.scope === "project");
  const [view, setView] = useState<"installed" | "discover">("installed");
  const installedNames = useMemo(() => new Set(skills.map((s) => s.name)), [skills]);
  const registry = readInstalledRegistry();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="kontinue-3d flex items-center gap-0.5 rounded-full p-0.5">
          <button
            type="button"
            onClick={() => setView("installed")}
            className={cn("flex h-7 cursor-pointer items-center rounded-full px-3 text-label transition-colors", view === "installed" ? "kontinue-capsule font-semibold text-purple-900 dark:text-purple-100" : "text-muted-foreground hover:text-foreground")}
          >
            Installed
          </button>
          <button
            type="button"
            onClick={() => setView("discover")}
            className={cn("flex h-7 cursor-pointer items-center rounded-full px-3 text-label transition-colors", view === "discover" ? "kontinue-capsule font-semibold text-purple-900 dark:text-purple-100" : "text-muted-foreground hover:text-foreground")}
          >
            Discover
          </button>
        </div>
        {view === "installed" ? (
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="kontinue-3d-primary flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-label font-medium"
          >
            {creating ? <X size={13} /> : <Plus size={13} />}
            {creating ? "Cancel" : "New skill"}
          </button>
        ) : (
          <span className="px-1 text-label text-muted-foreground">
            {skills.length} skill{skills.length === 1 ? "" : "s"} installed
          </span>
        )}
      </div>

      {view === "discover" ? <DiscoverSkills installedNames={installedNames} onInstalled={() => void reload()} /> : null}

      {view !== "installed" ? null : (
        <>
      <div className="mb-4 flex items-center justify-between">
        <p className="px-1 text-label text-muted-foreground">
          {skills.length} skill{skills.length === 1 ? "" : "s"} installed
          {projectRoot ? " · project + user" : " · user-level"}
        </p>
      </div>

      {creating ? (
        <section className="mb-6">
          <div className="liquid-glass-dropdown !rounded-[20px] p-4">
            <div className="space-y-3">
              <div>
                <label htmlFor="new-skill-name" className="mb-1 block text-label font-medium text-muted-foreground">Name</label>
                <input
                  id="new-skill-name"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="my-skill"
                  className="kontinue-3d h-8 w-full rounded-full px-3.5 text-body outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              <div>
                <label htmlFor="new-skill-desc" className="mb-1 block text-label font-medium text-muted-foreground">Description</label>
                <input
                  id="new-skill-desc"
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="One line describing what this skill does"
                  className="kontinue-3d h-8 w-full rounded-full px-3.5 text-body outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              <div>
                <label htmlFor="new-skill-body" className="mb-1 block text-label font-medium text-muted-foreground">Instructions</label>
                <textarea
                  id="new-skill-body"
                  value={draft.body}
                  onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                  rows={5}
                  placeholder="Markdown guidance for the agent…"
                  className="kontinue-3d w-full rounded-[16px] px-3.5 py-2.5 text-body outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              {error ? <p className="text-label text-rose-400">{error}</p> : null}
              <button
                type="button"
                onClick={() => void submitCreate()}
                className="kontinue-3d-primary h-8 cursor-pointer rounded-full px-4 text-label font-medium"
              >
                Create skill
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {error && !creating ? <p className="mb-4 text-label text-rose-400">{error}</p> : null}

      {loading ? (
        <p className="px-1 py-6 text-body text-muted-foreground">Loading skills…</p>
      ) : skills.length === 0 ? (
        <p className="px-1 py-6 text-body text-muted-foreground">
          No skills installed. Create one, or drop a <code className="font-mono">SKILL.md</code> folder into{" "}
          <code className="font-mono">~/.agents/skills/</code> or <code className="font-mono">.agents/skills/</code>.
        </p>
      ) : (
        <div className="space-y-6">
          {projectSkills.length > 0 ? (
            <SkillGroup
              title="Project skills"
              skills={projectSkills}
              registry={registry}
              disabled={disabled}
              expanded={expanded}
              files={files}
              fileContent={fileContent}
              onToggle={toggle}
              onExpand={(s) => void toggleExpand(s)}
              onViewFile={(s, p) => void viewFile(s, p)}
              onRemove={(s) => void removeSkill(s)}
            />
          ) : null}
          {userSkills.length > 0 ? (
            <SkillGroup
              title="User skills"
              skills={userSkills}
              registry={registry}
              disabled={disabled}
              expanded={expanded}
              files={files}
              fileContent={fileContent}
              onToggle={toggle}
              onExpand={(s) => void toggleExpand(s)}
              onViewFile={(s, p) => void viewFile(s, p)}
              onRemove={(s) => void removeSkill(s)}
            />
          ) : null}
        </div>
      )}
        </>
      )}
    </div>
  );
}

function SkillGroup({
  title,
  skills,
  registry,
  disabled,
  expanded,
  files,
  fileContent,
  onToggle,
  onExpand,
  onViewFile,
  onRemove,
}: {
  title: string;
  skills: KodeSkill[];
  registry: Record<string, InstalledSkillMeta>;
  disabled: Set<string>;
  expanded: string | null;
  files: Record<string, SkillFile[]>;
  fileContent: string | null;
  onToggle: (name: string) => void;
  onExpand: (skill: KodeSkill) => void;
  onViewFile: (skill: KodeSkill, path: string) => void;
  onRemove: (skill: KodeSkill) => void;
}) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-label font-medium text-muted-foreground">{title}</h2>
      <div className="liquid-glass-dropdown divide-y divide-black/[0.05] !rounded-[20px] dark:divide-white/[0.05]">
        {skills.map((skill) => {
          const isOpen = expanded === skill.name;
          const isDisabled = disabled.has(skill.name);
          const fileList = files[skill.name] ?? [];
          const textFiles = fileList.filter((f) => !f.is_dir);
          const meta = registry[skill.name];
          return (
            <div key={skill.name} className="px-4 py-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onExpand(skill)}
                  className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-left"
                >
                  <ChevronRight size={13} className={cn("mt-0.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <Sparkles size={13} className="shrink-0 text-purple-400" />
                      <span className="truncate text-body font-medium text-foreground/90">{skill.name}</span>
                      {scopeBadge(skill.scope)}
                      {meta ? (
                        <span className="shrink-0 rounded-full border border-black/10 px-1.5 py-px font-mono text-micro text-muted-foreground dark:border-white/10">
                          {meta.source}
                        </span>
                      ) : null}
                      {skill.license ? (
                        <span className="shrink-0 rounded-full border border-black/10 px-1.5 py-px text-micro text-muted-foreground dark:border-white/10">
                          {skill.license}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-label text-muted-foreground">{skill.description}</span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch checked={!isDisabled} onCheckedChange={() => onToggle(skill.name)} />
                  {skill.scope === "user" ? (
                    <button
                      type="button"
                      onClick={() => onRemove(skill)}
                      title="Delete skill"
                      className="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-rose-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </div>
              </div>

              {isOpen ? (
                <div className="mt-3 space-y-3 border-l border-black/[0.06] pl-4 dark:border-white/[0.08]">
                  <div>
                    <p className="mb-1 text-caption font-medium uppercase tracking-wide text-muted-foreground">Instructions</p>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-black/[0.04] px-3 py-2 text-label leading-5 text-foreground/75 dark:bg-white/[0.04]">
                      {skill.body}
                    </pre>
                  </div>
                  {textFiles.length > 0 ? (
                    <div>
                      <p className="mb-1 text-caption font-medium uppercase tracking-wide text-muted-foreground">Files</p>
                      <div className="space-y-0.5">
                        {textFiles.map((file) => (
                          <button
                            key={file.path}
                            type="button"
                            onClick={() => onViewFile(skill, file.path)}
                            className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-label text-foreground/70 kontinue-hover"
                          >
                            <FileText size={12} className="shrink-0 text-muted-foreground" />
                            <span className="truncate font-mono">{file.path}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {fileContent !== null ? (
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-black/[0.04] px-3 py-2 font-mono text-caption leading-5 text-foreground/70 dark:bg-white/[0.04]">
                      {fileContent}
                    </pre>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
