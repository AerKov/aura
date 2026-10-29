import type { FileRef } from "@aura/shared";
import type { FileView } from "@/features/chat/store";
import { setState } from "@/features/chat/store";
import { api, authFetch, call } from "./api";

/** Uploads a file the user picked into a chat; the message then names it by its id (ADR 0036). */
export function uploadToChat(chatId: string, file: File): Promise<FileRef> {
  return call(async () => {
    const result = await api.chats({ chatId }).files.post({ file });
    return result as { data: FileRef; error: null };
  });
}

export const chatFilePath = (chatId: string, fileId: string) =>
  `/chats/${encodeURIComponent(chatId)}/files/${encodeURIComponent(fileId)}`;

/** The bytes of a stored file. */
export async function fetchFile(path: string): Promise<Blob> {
  return (await authFetch(path)).blob();
}

/** Hands the user a file as a download: the browser or the desktop shell asks where to put it. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Opens the viewer window on a file. */
export function openFile(view: FileView): void {
  setState(() => ({ viewer: view }));
}

export function viewOfChatFile(chatId: string, file: FileRef): FileView {
  return { name: file.name, type: file.type, load: () => fetchFile(chatFilePath(chatId, file.id)) };
}
