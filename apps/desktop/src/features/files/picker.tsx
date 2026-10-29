import { Paperclip } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getState, setState, useChatStore } from "@/features/chat/store";
import { useT } from "@/features/localization/i18n";

/** What an app asked for when it wants the user to add files (ADR 0036). */
export interface FileRequest {
  appName: string;
  /** An `accept` string for the picker, like "application/pdf,.csv". */
  accept?: string;
  multiple: boolean;
  finish: (files: File[]) => void;
}

/** Shows the add-files window for an app and resolves with what the user chose, or nothing. */
export function askForFiles(opts: Omit<FileRequest, "finish">): Promise<File[]> {
  return new Promise((resolve) => {
    getState().filePicker?.finish([]);
    setState(() => ({ filePicker: { ...opts, finish: resolve } }));
  });
}

/**
 * The window an app's "add files" opens: a button and a place to drop files. It is the host's, not
 * the app's, so a click here is a real click and the picker always opens (ADR 0036).
 */
export function FilePicker() {
  const t = useT();
  const request = useChatStore((s) => s.filePicker);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  if (!request) return null;
  const done = (files: File[]) => {
    setState(() => ({ filePicker: null }));
    request.finish(files);
  };
  const take = (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (files.length > 0) done(request.multiple ? files : files.slice(0, 1));
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("Cancel")}
        className="absolute inset-0 cursor-default bg-black/50"
        onClick={() => done([])}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("Add files to {name}", { name: request.appName })}
        className="bg-background relative grid w-[min(440px,96vw)] gap-3 border p-4 shadow-lg"
      >
        <h2 className="text-lg">{t("Add files to {name}", { name: request.appName })}</h2>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: dropping is a pointer-only shortcut; the button below does the same */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files);
          }}
          className={`grid place-items-center gap-2 border border-dashed px-4 py-8 text-center text-sm ${over ? "border-primary bg-primary/10" : ""}`}
        >
          <Paperclip className="text-muted-foreground size-6" strokeWidth={1.5} />
          <span className="text-muted-foreground">{t("Drop files here, or")}</span>
          <input
            ref={input}
            type="file"
            hidden
            multiple={request.multiple}
            accept={request.accept}
            onChange={(e) => take(e.target.files)}
          />
          <Button onClick={() => input.current?.click()}>{t("Choose from this computer")}</Button>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => done([])}>
            {t("Cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
