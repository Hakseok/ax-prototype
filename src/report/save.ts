// Hand a generated file to the viewer. Inside a claude.ai Artifact the page cannot download on its
// own, so it asks the viewer through the `downloads` capability (a confirmation the viewer may
// decline). Elsewhere (local dev, a static host) it falls back to an ordinary browser download.

interface DownloadsCapability {
  save(req: { filename: string; data: Blob | string }): Promise<{ status: 'saved' | 'delivered' }>;
}
type ClaudeWindow = Window & { claude?: { use(name: string): Promise<unknown> } };

export type SaveOutcome = 'saved' | 'declined' | 'unavailable';

const capability = async (): Promise<DownloadsCapability | null> => {
  const c = (window as ClaudeWindow).claude;
  if (!c?.use) return null;
  try {
    return (await c.use('downloads')) as DownloadsCapability | null;
  } catch {
    return null;
  }
};

export const saveFile = async (filename: string, data: Blob | string): Promise<SaveOutcome> => {
  const inArtifact = !!(window as ClaudeWindow).claude?.use;
  const downloads = await capability();
  if (downloads) {
    try {
      await downloads.save({ filename, data });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string }).code;
      return code === 'declined' ? 'declined' : 'unavailable';
    }
  }
  // Inside an Artifact without the capability a plain download is blocked: report it instead of failing silently.
  if (inArtifact) return 'unavailable';
  const blob = typeof data === 'string' ? new Blob([data], { type: 'text/plain;charset=utf-8' }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
};
