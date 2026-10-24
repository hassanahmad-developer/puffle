import JSZip from 'jszip';

// Recursively read a directory entry (folder drag-drop support)
function readDirectoryEntry(dirEntry, folderPaths) {
  return new Promise((resolve, reject) => {
    const reader = dirEntry.createReader();
    const all = [];
    const readBatch = () => {
      reader.readEntries(async (entries) => {
        if (!entries.length) {
          resolve(all);
          return;
        }
        try {
          for (const entry of entries) {
            if (entry.isFile) {
              const file = await new Promise((res, rej) => entry.file(res, rej));
              file.puffleRelativePath = entry.fullPath.replace(/^\/+/, '');
              all.push(file);
            } else if (entry.isDirectory) {
              folderPaths.push(entry.fullPath.replace(/^\/+|\/+$/g, ''));
              const nested = await readDirectoryEntry(entry, folderPaths);
              all.push(...nested);
            }
          }
          readBatch();
        } catch (error) {
          reject(error);
        }
      }, reject);
    };
    readBatch();
  });
}

// NOTE: dataTransfer.items ko await se pehle hi (synchronously) padhna zaroori hai
export async function collectDroppedFiles(dataTransfer) {
  const items = dataTransfer.items;
  if (!items || !items.length) {
    return { files: Array.from(dataTransfer.files || []), folderPaths: [] };
  }
  const files = [];
  const folderPaths = [];
  const promises = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (entry) {
      if (entry.isDirectory) {
        folderPaths.push(entry.fullPath.replace(/^\/+|\/+$/g, ''));
        promises.push(readDirectoryEntry(entry, folderPaths).then((list) => files.push(...list)));
      } else if (entry.isFile) {
        promises.push(new Promise((res, rej) => entry.file((f) => { files.push(f); res(); }, rej)));
      }
    } else {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  await Promise.all(promises);
  return { files, folderPaths };
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadAsZip(files, zipName = 'puffle-files.zip') {
  if (!files || !files.length) return;
  const zip = new JSZip();
  const usedNames = new Set();
  for (const file of files) {
    let name = (file.webkitRelativePath || file.name || 'file').replace(/^\/+/, '');
    if (!name) name = 'file';
    let finalName = name;
    let n = 1;
    while (usedNames.has(finalName)) {
      const dot = name.lastIndexOf('.');
      if (dot > 0) finalName = name.slice(0, dot) + ' (' + n + ')' + name.slice(dot);
      else finalName = name + ' (' + n + ')';
      n++;
    }
    usedNames.add(finalName);
    zip.file(finalName, file);
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function createFolderArchive(files, folderPaths, onProgress) {
  const archive = new JSZip();
  const paths = new Set(folderPaths.filter(Boolean));
  paths.forEach((folderPath) => archive.folder(folderPath));
  files.forEach((file) => {
    const path = (file.puffleRelativePath || file.webkitRelativePath || file.name || 'file').replace(/^\/+/, '');
    archive.file(path, file);
  });

  const rootFolders = [...new Set(folderPaths.map((path) => path.split('/')[0]).filter(Boolean))];
  const baseName = rootFolders.length === 1 ? rootFolders[0] : 'Puffle-folders';
  const safeName = baseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'Puffle-folder';
  const blob = await archive.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } },
    (metadata) => onProgress(Math.round(metadata.percent))
  );
  return new File([blob], `${safeName}.zip`, { type: 'application/zip' });
}