export async function openExternal(url) {
  if (!url) return;

  try {
    if (window?.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url);
      return;
    }

    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

