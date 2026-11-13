import { CircleCheck } from "@/components/animate-ui/icons/circle-check";
import { LoaderCircle } from "@/components/animate-ui/icons/loader-circle";
import { Terminal } from "@/components/animate-ui/icons/terminal";
import { Timer } from "@/components/animate-ui/icons/timer";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ToolCommand, ToolRun } from "@/lib/api";

const COMMANDS: { command: ToolCommand; label: string; hint: string }[] = [
  { command: "check", label: "Check", hint: "Validate the schema and audit the build against the sheet" },
  { command: "validate", label: "Validate", hint: "Check character.json against the schema" },
  { command: "audit", label: "Audit", hint: "Recompute every modifier and compare it with the sheet" },
  { command: "render", label: "Render", hint: "Regenerate docs/characters/<slug>/character.md" },
  { command: "build", label: "Build", hint: "Regenerate foundry-export.json for Foundry" },
];

export function ActionBar({
  running,
  onRun,
}: {
  running: ToolCommand | null;
  onRun: (command: ToolCommand) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {COMMANDS.map(({ command, label, hint }) => (
        <Button
          key={command}
          variant={command === "check" ? "default" : "outline"}
          size="sm"
          disabled={running !== null}
          onClick={() => onRun(command)}
          title={hint}
        >
          {running === command ? (
            <LoaderCircle className="size-4" />
          ) : (
            command === "check" && <CircleCheck className="size-4" />
          )}
          {label}
        </Button>
      ))}
    </div>
  );
}

function duration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function RunEntry({ run }: { run: ToolRun }) {
  const failed = run.exitCode !== 0;
  const output = `${run.stdout}${run.stderr}`.trimEnd();

  return (
    <div className="border-b py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <Terminal className="text-muted-foreground size-3.5" />
        <span className="font-mono text-sm font-medium">{run.command}</span>
        {failed ? (
          <Badge variant="destructive">exit {run.exitCode}</Badge>
        ) : (
          <Badge variant="outline">exit {run.exitCode}</Badge>
        )}
        <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs tabular-nums">
          <Timer className="size-3" />
          {duration(run.durationMs)}
        </span>
      </div>
      {output && (
        <pre className="text-muted-foreground mt-2 max-h-64 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-xs leading-relaxed whitespace-pre">
          {output}
        </pre>
      )}
    </div>
  );
}

export function RunPanel({
  runs,
  running,
  onRun,
}: {
  runs: ToolRun[];
  running: ToolCommand | null;
  onRun: (command: ToolCommand) => void;
}) {
  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Runs
          {runs.length > 0 && <Badge variant="secondary">{runs.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col gap-3">
        <ActionBar running={running} onRun={onRun} />
        <ScrollArea className="h-[32rem]">
          {runs.length === 0 ? (
            <p className="text-muted-foreground py-4 text-sm">
              No runs yet. Pick an action above to run it against the character.
            </p>
          ) : (
            runs.map((run, index) => (
              <RunEntry key={`${run.finishedAt}-${index}`} run={run} />
            ))
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
