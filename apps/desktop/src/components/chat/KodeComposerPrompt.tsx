import { Check, FilePen, FilePlus, Terminal, Wrench } from "lucide-react";
import { MessageResponse } from "@/components/ai-elements/message";
import { type ReactNode, useState } from "react";
import type { KodeToolStep } from "@/lib/kode-agent";

type OptionItem = { value: string; label: string; description?: string };
type QuestionItem = {
  question: string;
  kind?: string;
  options?: OptionItem[];
  allowOther?: boolean;
  placeholder?: string;
};

function asOptions(raw: unknown): OptionItem[] {
  if (!Array.isArray(raw)) return [];
  const items: OptionItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label : typeof record.value === "string" ? record.value : "";
    if (!label) continue;
    items.push({
      value: typeof record.value === "string" ? record.value : label,
      label,
      description: typeof record.description === "string" ? record.description : undefined,
    });
  }
  return items;
}

function asQuestions(raw: unknown): QuestionItem[] {
  if (!Array.isArray(raw)) return [];
  const items: QuestionItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.question !== "string" || !record.question.trim()) continue;
    items.push({
      question: record.question,
      kind: typeof record.kind === "string" ? record.kind : undefined,
      options: asOptions(record.options),
      allowOther: Boolean(record.allowOther),
      placeholder: typeof record.placeholder === "string" ? record.placeholder : undefined,
    });
  }
  return items;
}

// Shared 3D control styles — the same "sleek metallic" language as the rest of
// the app (.kontinue-3d / .kontinue-3d-primary), sized up so these prompts read
// as clear actions instead of tiny inline labels.
const primary =
  "kontinue-3d-primary flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13px] font-medium disabled:cursor-default disabled:opacity-50";
const secondary =
  "kontinue-3d flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[13px] text-foreground/85 hover:text-foreground";
const chip =
  "kontinue-3d flex h-8 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-[13px] text-foreground/85 hover:text-foreground";
const chipPicked =
  "kontinue-3d-primary flex h-8 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-[13px] font-medium";

function OptionButton({ option, selected, onClick }: { option: OptionItem; selected?: boolean; onClick: () => void }) {
  return (
    <button type="button" title={option.description} onClick={onClick} className={selected ? chipPicked : chip}>
      {option.label}
    </button>
  );
}

export function KodeComposerPrompt({
  step,
  onApprove,
  onReject,
  onOptions,
  onApproveAll,
}: {
  step: KodeToolStep;
  onApprove: (id: string) => void;
  onReject: (id: string, note?: string) => void;
  onOptions: (id: string, values: string[]) => void;
  onApproveAll?: (id: string) => void;
}) {
  if (step.state === "pending-approval") {
    return <ApprovalPrompt step={step} onApprove={onApprove} onReject={onReject} onApproveAll={onApproveAll} />;
  }

  if (step.state !== "pending-options") return null;

  const form = asQuestions(step.args.questions);
  if (form.length > 1) {
    return <FormPrompt stepId={step.id} questions={form} onOptions={onOptions} />;
  }

  const question = typeof step.args.question === "string" ? step.args.question : step.description;
  const options = asOptions(step.args.options);
  const kind = typeof step.args.kind === "string" ? step.args.kind : "";
  const multiple = Boolean(step.args.multiple) || kind === "multi";
  const allowOther = Boolean(step.args.allowOther);
  const placeholder = typeof step.args.placeholder === "string" ? step.args.placeholder : "Type your answer";
  const textOnly = kind === "text" || (options.length === 0 && kind !== "confirm");
  const confirm = kind === "confirm" || (options.length === 0 && kind === "confirm");

  if (confirm) {
    return (
      <PromptShell question={question}>
        <button type="button" onClick={() => onOptions(step.id, ["no"])} className={secondary}>
          No
        </button>
        <button type="button" onClick={() => onOptions(step.id, ["yes"])} className={primary}>
          Yes
        </button>
      </PromptShell>
    );
  }

  if (textOnly) {
    return <TextPrompt stepId={step.id} question={question} placeholder={placeholder} onOptions={onOptions} />;
  }

  return (
    <ChoicePrompt
      stepId={step.id}
      question={question}
      options={options}
      multiple={multiple}
      allowOther={allowOther}
      onOptions={onOptions}
    />
  );
}

/** Tools whose approval can be given once for the whole chat. */
export const CHAT_APPROVABLE_TOOLS = new Set(["edit_file", "write_file"]);

/** What an edit would change: removed lines, then added lines. */
function EditPreview({ step }: { step: KodeToolStep }) {
  const oldText = typeof step.args.old_string === "string" ? step.args.old_string : null;
  const newText = typeof step.args.new_string === "string" ? step.args.new_string : null;
  const content = typeof step.args.content === "string" ? step.args.content : null;
  const lines: { kind: "add" | "remove"; text: string }[] = [];
  if (oldText !== null) for (const line of oldText.split("\n")) lines.push({ kind: "remove", text: line });
  if (newText !== null) for (const line of newText.split("\n")) lines.push({ kind: "add", text: line });
  if (oldText === null && content !== null) for (const line of content.split("\n").slice(0, 200)) lines.push({ kind: "add", text: line });
  if (lines.length === 0) return null;
  return (
    <pre className="max-h-48 overflow-auto rounded-lg bg-black/[0.04] py-1.5 font-mono text-[11.5px] leading-5 dark:bg-white/[0.05]">
      {lines.map((line, index) => (
        <div
          key={index}
          className={
            line.kind === "add"
              ? "bg-emerald-500/10 px-2.5 text-emerald-700 dark:text-emerald-300"
              : "bg-red-500/10 px-2.5 text-red-700 dark:text-red-300"
          }
        >
          {line.kind === "add" ? "+ " : "- "}
          {line.text || " "}
        </div>
      ))}
    </pre>
  );
}

/** Claude-style approval: one line saying what Kode wants to do, the command
 *  or change one click away (not dumped inline), and three clear answers. */
function ApprovalPrompt({
  step,
  onApprove,
  onReject,
  onApproveAll,
}: {
  step: KodeToolStep;
  onApprove: (id: string) => void;
  onReject: (id: string, note?: string) => void;
  onApproveAll?: (id: string) => void;
}) {
  const command = typeof step.args.command === "string" ? step.args.command.trim() : "";
  const path = typeof step.args.path === "string" ? step.args.path : "";
  const isEdit = step.name === "edit_file";
  const isWrite = step.name === "write_file";
  const fileName = path.split(/[\\/]/).pop() || path;
  const [showDetail, setShowDetail] = useState(false);
  const [denying, setDenying] = useState(false);
  const [note, setNote] = useState("");
  const title = command
    ? "Kode wants to run a command"
    : isEdit
      ? `Kode wants to edit ${fileName}`
      : isWrite
        ? `Kode wants to create ${fileName}`
        : "Kode wants to take an action";
  const Icon = command ? Terminal : isEdit ? FilePen : isWrite ? FilePlus : Wrench;
  const hasDetail = Boolean(command) || isEdit || isWrite;
  const detailLabel = command ? "command" : "changes";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="kontinue-3d flex size-7 shrink-0 items-center justify-center rounded-full">
          <Icon className="size-3.5 text-purple-500" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">{title}</p>
          <p className="mt-0.5 truncate text-[12px] text-foreground/60">
            {command ? step.description : path || step.description}
            {hasDetail ? (
              <button
                type="button"
                onClick={() => setShowDetail((current) => !current)}
                className="ml-2 cursor-pointer text-purple-600 hover:underline dark:text-purple-400"
              >
                {showDetail ? `Hide ${detailLabel}` : `View ${detailLabel}`}
              </button>
            ) : null}
          </p>
        </div>
      </div>

      {showDetail ? (
        command ? (
          <pre className="max-h-32 overflow-auto rounded-xl bg-black/[0.04] px-3 py-2 font-mono text-[11.5px] leading-5 text-foreground/75 dark:bg-white/[0.05]">
            {command}
          </pre>
        ) : (
          <EditPreview step={step} />
        )
      ) : null}

      {denying ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            onReject(step.id, note);
          }}
        >
          <input
            autoFocus
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Tell Kode what to do instead (optional)"
            className="kontinue-3d h-8 min-w-0 flex-1 rounded-full bg-transparent px-3.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
          <button type="submit" className={primary}>
            Deny
          </button>
          <button type="button" onClick={() => setDenying(false)} className={secondary}>
            Back
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => onApprove(step.id)} className={primary}>
            Allow
          </button>
          {onApproveAll && CHAT_APPROVABLE_TOOLS.has(step.name) ? (
            <button type="button" onClick={() => onApproveAll(step.id)} className={secondary} title="Don't ask again for file edits in this chat">
              Allow edits in this chat
            </button>
          ) : null}
          <button type="button" onClick={() => setDenying(true)} className={secondary}>
            Deny
          </button>
        </div>
      )}
    </div>
  );
}

function QuestionText({ text }: { text: string }) {
  // Questions often name code (`addTodo`): render inline Markdown.
  return (
    <div className="text-[13px] font-medium leading-snug text-foreground [&_p]:m-0 [&_p]:leading-snug">
      <MessageResponse>{text}</MessageResponse>
    </div>
  );
}

function PromptShell({ question, children }: { question: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
      <QuestionText text={question} />
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function TextPrompt({
  stepId,
  question,
  placeholder,
  onOptions,
}: {
  stepId: string;
  question: string;
  placeholder: string;
  onOptions: (id: string, values: string[]) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <PromptShell question={question}>
      <form
        className="flex w-full items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const text = value.trim();
          if (text) onOptions(stepId, [text]);
        }}
      >
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          className="kontinue-3d h-8 min-w-0 flex-1 rounded-full bg-transparent px-3.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
        />
        <button type="submit" disabled={!value.trim()} className={primary}>
          Send
        </button>
      </form>
    </PromptShell>
  );
}

function ChoicePrompt({
  stepId,
  question,
  options,
  multiple,
  allowOther,
  onOptions,
}: {
  stepId: string;
  question: string;
  options: OptionItem[];
  multiple: boolean;
  allowOther: boolean;
  onOptions: (id: string, values: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");

  const submit = (values: string[]) => {
    const extra = other.trim();
    const next = extra ? [...values, extra] : values;
    if (next.length > 0) onOptions(stepId, next);
  };

  // Claude-style: always a numbered list, then a row for your own answer.
  const detailed = true;
  const pick = (option: OptionItem) => {
    if (!multiple) {
      setPicked([option.value]);
      if (!other.trim()) onOptions(stepId, [option.value]);
      return;
    }
    setPicked((current) => (current.includes(option.value) ? current.filter((value) => value !== option.value) : [...current, option.value]));
  };
  // Your own answer is always possible (options rarely cover everything).
  const showOther = true;
  void allowOther;

  return (
    <PromptShell question={question}>
      {detailed ? (
        <div className="flex w-full flex-col gap-1">
          {options.map((option, index) => {
            const selected = picked.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => pick(option)}
                className={`flex w-full cursor-pointer items-start gap-2.5 rounded-2xl px-3 py-2 text-left transition-colors ${selected ? "bg-purple-500/15 ring-1 ring-purple-500/40" : "bg-black/[0.03] hover:bg-black/[0.06] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"}`}
              >
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-[10.5px] font-medium text-foreground/70 dark:bg-white/[0.08]">
                  {selected ? <Check size={11} /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-foreground">{option.label}</span>
                  {option.description ? <span className="mt-0.5 block text-[12px] leading-snug text-foreground/60">{option.description}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {options.map((option) => (
            <OptionButton key={option.value} option={option} selected={picked.includes(option.value)} onClick={() => pick(option)} />
          ))}
        </div>
      )}
      {showOther ? (
        <input
          value={other}
          onChange={(event) => setOther(event.target.value)}
          placeholder="Or type your own answer"
          onKeyDown={(event) => {
            if (event.key === "Enter" && other.trim()) submit(picked);
          }}
          className="kontinue-3d h-8 min-w-[8rem] flex-1 rounded-full bg-transparent px-3.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
        />
      ) : null}
      {multiple || other.trim() ? (
        <button
          type="button"
          onClick={() => submit(picked)}
          disabled={picked.length === 0 && !other.trim()}
          className={primary}
        >
          Continue
        </button>
      ) : null}
    </PromptShell>
  );
}

function FormPrompt({
  stepId,
  questions,
  onOptions,
}: {
  stepId: string;
  questions: QuestionItem[];
  onOptions: (id: string, values: string[]) => void;
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({});

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 py-1">
      {questions.map((item, index) => {
        const inputId = `kode-question-${stepId}-${index}`;
        const choices = item.options && item.options.length > 0 && item.kind !== "text" ? item.options : null;
        if (choices) {
          return (
            <div key={item.question}>
              <QuestionText text={item.question} />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {choices.map((option) => (
                  <OptionButton
                    key={option.value}
                    option={option}
                    selected={answers[index] === option.value}
                    onClick={() => setAnswers((current) => ({ ...current, [index]: option.value }))}
                  />
                ))}
              </div>
            </div>
          );
        }
        return (
          <div key={item.question}>
            <label htmlFor={inputId} className="text-[13px] font-medium text-foreground">
              {item.question}
            </label>
            <input
              id={inputId}
              value={answers[index] ?? ""}
              onChange={(event) => setAnswers((current) => ({ ...current, [index]: event.target.value }))}
              placeholder={item.placeholder ?? "Your answer"}
              className="kontinue-3d mt-1.5 h-8 w-full rounded-full bg-transparent px-3.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
            />
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => {
          const values = questions.map((_, index) => answers[index]?.trim() ?? "").filter(Boolean);
          if (values.length > 0) onOptions(stepId, values);
        }}
        className={`${primary} self-start`}
      >
        Continue
      </button>
    </div>
  );
}
