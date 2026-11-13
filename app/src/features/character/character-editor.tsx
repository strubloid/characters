import { useRef, useState } from "react";
import { ArrowDownToLine, Check, Download, FileJson, Save, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  importFoundryCharacter,
  importRepositoryFoundryExport,
  saveCharacter,
  type Audit,
  type Character,
} from "@/lib/api";

type EditorResult = { character: Character; audit: Audit; generated: boolean; generationOutput: string; hasNativeExport: boolean };

export function CharacterEditor({
  slug,
  character,
  hasNativeExport,
  onSaved,
}: {
  slug: string;
  character: Character;
  hasNativeExport: boolean;
  onSaved: (result: EditorResult) => void;
}) {
  const [document, setDocument] = useState(() => JSON.stringify(character, null, 2));
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const savedDocument = JSON.stringify(character, null, 2);
  const changed = document !== savedDocument;

  async function handleSave() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(document);
    } catch (parseError) {
      setMessage({ kind: "error", text: parseError instanceof Error ? parseError.message : "The JSON is not valid." });
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setMessage({ kind: "error", text: "The character document must be a JSON object." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const result = await saveCharacter(slug, parsed);
      onSaved(result);
      setDocument(JSON.stringify(result.character, null, 2));
      setMessage({ kind: result.generated ? "success" : "error", text: result.generated
        ? "Saved to SQLite and character.json. Foundry export and sheet were regenerated."
        : `Saved, but generated files need attention. ${result.generationOutput}` });
    } catch (saveError) {
      setMessage({ kind: "error", text: saveError instanceof Error ? saveError.message : String(saveError) });
    } finally {
      setSaving(false);
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setMessage(null);
    try {
      const result = await importFoundryCharacter(slug, file);
      onSaved(result);
      setDocument(JSON.stringify(result.character, null, 2));
      setMessage({ kind: result.generated ? "success" : "error", text: result.generated
        ? `Merged ${file.name}. Original export is preserved as foundry-native.json; Foundry import was rebuilt.`
        : `Import saved, but generated files need attention. ${result.generationOutput}` });
    } catch (importError) {
      setMessage({ kind: "error", text: importError instanceof Error ? importError.message : String(importError) });
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function handleRepositoryImport() {
    setImporting(true);
    setMessage(null);
    try {
      const result = await importRepositoryFoundryExport(slug);
      onSaved(result);
      setDocument(JSON.stringify(result.character, null, 2));
      setMessage({ kind: result.generated ? "success" : "error", text: result.generated
        ? `Merged ${result.importedFrom}. The complete native export and a new Foundry import are ready.`
        : `Import saved, but generated files need attention. ${result.generationOutput}` });
    } catch (importError) {
      setMessage({ kind: "error", text: importError instanceof Error ? importError.message : String(importError) });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Edit {character.name}</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Edit every schema field in the character document. Saving validates the source and regenerates the Foundry import.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={changed ? "secondary" : "outline"}>{changed ? "Unsaved changes" : "All changes saved"}</Badge>
          <Button onClick={() => void handleSave()} disabled={!changed || saving || importing}>
            {saving ? <Save className="size-4 animate-pulse" /> : <Check className="size-4" />}
            {saving ? "Saving…" : "Save character"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileJson className="size-4" />
              Complete character document
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-5">
            <Textarea
              aria-label="Complete character JSON"
              value={document}
              onChange={(event) => {
                setDocument(event.target.value);
                setMessage(null);
              }}
              spellCheck={false}
              className="min-h-[min(72vh,56rem)] resize-y rounded-lg bg-muted/30 font-mono text-xs leading-relaxed"
            />
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Bring in a Foundry export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground text-sm leading-relaxed">
                Merge a Pathfinder actor export into this character. New feats, actions, gear, biography, and proficiencies are imported; existing ability scores, observed sheet values, and audit notes are retained when the export omits them.
              </p>
              <Input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                aria-label="Choose a Foundry actor JSON export"
                disabled={saving || importing}
                onChange={(event) => void handleImport(event.target.files?.[0])}
              />
              <Button variant="outline" className="w-full" onClick={() => void handleRepositoryImport()} disabled={saving || importing}>
                <FileJson className="size-4" />
                Import personnage.json from workspace
              </Button>
              {importing && <p role="status" className="text-muted-foreground text-xs">Importing and rebuilding the character…</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Foundry files</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button asChild variant="outline" className="justify-start">
                <a href={`/api/characters/${slug}/files/foundry-export`} download>
                  <Download className="size-4" />
                  Download rebuilt Foundry import
                </a>
              </Button>
              {hasNativeExport && (
                <Button asChild variant="outline" className="justify-start">
                  <a href={`/api/characters/${slug}/files/foundry-native`} download>
                    <Download className="size-4" />
                    Download original Foundry export
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">What gets written</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p><code>characters/{slug}/character.json</code> stays the source used by the tools.</p>
              <p>The SQLite database keeps an editable snapshot, Pathfinder notes, theme setting, and the full Foundry import.</p>
              <p>Save regenerates <code>foundry-export.json</code> and the readable Markdown sheet.</p>
            </CardContent>
          </Card>

          {message && (
            <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error"
              ? "text-destructive flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
              : "flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm"}>
              {message.kind === "error" ? <TriangleAlert className="mt-0.5 size-4 shrink-0" /> : <ArrowDownToLine className="mt-0.5 size-4 shrink-0" />}
              <span>{message.text}</span>
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
