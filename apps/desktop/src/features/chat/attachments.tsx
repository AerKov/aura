import { type FileRef, formatBytes, previewKind } from "@aura/shared";
import { Download, File as FileIcon, FileText, Image as ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/features/localization/i18n";
import { chatFilePath, fetchFile, openFile, saveBlob, viewOfChatFile } from "@/lib/files";
import { reportError } from "./actions";

/**
 * The files of a message (ADR 0036): pictures as thumbnails, the rest as a row with a name and a
 * size. A click opens the viewer (PDF, image, text); the arrow saves the file to the computer.
 */
export function Attachments({ chatId, files }: { chatId: string; files: FileRef[] }) {
  if (files.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-2">
      {files.map((file) => (
        <li key={file.id} className="min-w-0 max-w-full">
          <Attachment chatId={chatId} file={file} />
        </li>
      ))}
    </ul>
  );
}

function Attachment({ chatId, file }: { chatId: string; file: FileRef }) {
  const t = useT();
  const kind = previewKind(file.type);
  const open = () => {
    if (kind === "none") void save();
    else openFile(viewOfChatFile(chatId, file));
  };
  const save = async () => {
    try {
      saveBlob(await fetchFile(chatFilePath(chatId, file.id)), file.name);
    } catch (error) {
      reportError(error);
    }
  };
  const Icon = kind === "image" ? ImageIcon : kind === "none" ? FileIcon : FileText;
  return (
    <div className="bg-card flex max-w-full items-stretch border">
      {kind === "image" && <Thumbnail chatId={chatId} file={file} onOpen={open} />}
      <button
        type="button"
        onClick={open}
        title={t("Open {name}", { name: file.name })}
        className="hover:bg-foreground/[0.05] flex min-w-0 items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <Icon className="text-muted-foreground size-4 shrink-0" strokeWidth={1.5} />
        <span className="min-w-0">
          <span className="block max-w-[260px] truncate text-[13.5px]">{file.name}</span>
          <span className="text-muted-foreground block font-mono text-[11px]">
            {formatBytes(file.size)}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={t("Save {name}", { name: file.name })}
        title={t("Save to this computer")}
        onClick={() => void save()}
        className="text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] grid w-8 place-items-center border-l"
      >
        <Download className="size-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}

function Thumbnail({
  chatId,
  file,
  onOpen,
}: {
  chatId: string;
  file: FileRef;
  onOpen: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let alive = true;
    fetchFile(chatFilePath(chatId, file.id))
      .then((blob) => {
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [chatId, file.id]);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={file.name}
      className="block w-16 shrink-0 border-r"
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
    </button>
  );
}
