/**
 * Saves text as a file using a local blob: URL. The file is built entirely in
 * the browser; nothing is uploaded and no network request is made.
 */
export function downloadTextFile(text: string, fileName: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
