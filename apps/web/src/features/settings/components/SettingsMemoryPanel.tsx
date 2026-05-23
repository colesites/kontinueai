"use client";

import { useDeferredValue, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Progress } from "@repo/ui/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { memoryTypeLabel } from "@repo/core/memory";
import type { MemoryType } from "@repo/core/memory";

export function SettingsMemoryPanel() {
  const [search, setSearch] = useState("");
  const [manualType, setManualType] = useState<MemoryType>("context");
  const [manualContent, setManualContent] = useState("");
  const deferredSearch = useDeferredValue(search);
  const memoryStatus = useQuery(api.memories.getMemoryStatus, {});
  const memoryTypes = useQuery(api.memories.getMemoryTypes, {});
  const memories = useQuery(api.memories.listDashboardMemories, {
    search: deferredSearch.trim() ? deferredSearch : undefined,
    limit: 60,
  });
  const pinMemory = useMutation(api.memories.pinMemory);
  const deleteMemory = useMutation(api.memories.deleteMemory);
  const createManualMemory = useAction(api.memoryWorkers.createManualMemory);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Memory</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Review what Kontinue AI keeps, pin important context, and free up space
          when memory storage reaches your plan limit.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-background/70 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Memory Usage</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Stored memories and rolling summaries count against this quota.
            </p>
          </div>
          {memoryStatus ? (
            <div className="text-right text-sm">
              <div className="font-medium">
                {memoryStatus.usedBytesLabel} / {memoryStatus.limitBytesLabel}
              </div>
              <div className="text-xs text-muted-foreground">
                {memoryStatus.memoryCount} memories, {memoryStatus.summaryCount} summaries
              </div>
            </div>
          ) : null}
        </div>

        <Progress value={memoryStatus?.usagePercent ?? 0} className="h-2" />

        {memoryStatus?.warning ? (
          <Alert>
            <AlertTitle>Memory storage is full</AlertTitle>
            <AlertDescription>{memoryStatus.warning}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="rounded-xl border border-border/60 bg-background/70 p-5 space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Save Memory Manually</p>
          <p className="text-xs text-muted-foreground">
            Pin durable context explicitly when you want it preserved even if it
            did not come from normal extraction.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
          <Select
            value={manualType}
            onValueChange={(value) => setManualType(value as MemoryType)}
          >
            <SelectTrigger className="border-border/70 bg-background/80">
              <SelectValue placeholder="Memory type" />
            </SelectTrigger>
            <SelectContent>
              {(memoryTypes ?? []).map((type) => (
                <SelectItem key={type} value={type}>
                  {memoryTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Textarea
            value={manualContent}
            onChange={(event) => setManualContent(event.target.value)}
            placeholder="Example: My startup is Kontinue AI and I want the assistant to remember that."
            className="min-h-24 border-border/70 bg-background/80"
          />

          <Button
            type="button"
            className="self-start"
            onClick={async () => {
              const content = manualContent.trim();
              if (content.length < 8) return;
              await createManualMemory({
                type: manualType,
                content,
                pinned: true,
              });
              setManualContent("");
            }}
          >
            <Plus className="h-4 w-4" />
            Save
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-background/70 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search saved memory"
            className="border-border/70 bg-background/80"
          />
        </div>

        <div className="space-y-3">
          {memories === undefined ? (
            <div className="text-sm text-muted-foreground">Loading memory…</div>
          ) : memories.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
              No memories matched this search yet.
            </div>
          ) : (
            memories.map((memory) => (
              <div
                key={memory._id}
                className="rounded-xl border border-border/60 bg-card/60 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={memory.pinned ? "default" : "secondary"}>
                        {memoryTypeLabel(memory.type)}
                      </Badge>
                      {memory.pinned ? (
                        <Badge variant="outline">Pinned</Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        Importance {Math.round(memory.importanceScore * 100)}%
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-foreground">
                      {memory.content}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        void pinMemory({
                          memoryId: memory._id,
                          pinned: !memory.pinned,
                        })
                      }
                    >
                      {memory.pinned ? (
                        <PinOff className="h-4 w-4" />
                      ) : (
                        <Pin className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void deleteMemory({ memoryId: memory._id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
