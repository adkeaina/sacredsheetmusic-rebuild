import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
export async function pdfThumbnail(file: File, signal: AbortSignal) {
  const pdf = await import('pdfjs-dist');
  pdf.GlobalWorkerOptions.workerSrc = pdfWorker;
  const task = pdf.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const abort = () => void task.destroy();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({
      scale: Math.min(1, 600 / page.getViewport({ scale: 1 }).width),
    });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not create the preview.'))),
        'image/png',
      ),
    );
    return new File([blob], 'score-preview.png', { type: 'image/png' });
  } finally {
    signal.removeEventListener('abort', abort);
    await task.destroy();
  }
}
export async function convertRecording(
  file: File,
  signal: AbortSignal,
  onProgress: (value: number) => void,
) {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const ffmpeg = new FFmpeg();
  const coreResponse = await fetch('/processing/ffmpeg-core.js', { signal });
  if (!coreResponse.ok)
    throw new Error('Audio conversion is unavailable. Upload the original recording instead.');
  const coreURL = URL.createObjectURL(
    new Blob([await coreResponse.text()], { type: 'text/javascript' }),
  );
  const abort = () => ffmpeg.terminate();
  signal.addEventListener('abort', abort, { once: true });
  try {
    ffmpeg.on('progress', ({ progress }) =>
      onProgress(Math.round(Math.max(0, Math.min(1, progress)) * 100)),
    );
    await ffmpeg.load({
      coreURL,
      wasmURL: new URL('/processing/ffmpeg-core.wasm', location.origin).href,
    });
    await ffmpeg.writeFile(
      'input.' + file.name.split('.').at(-1),
      new Uint8Array(await file.arrayBuffer()),
    );
    const result = await ffmpeg.exec([
      '-i',
      'input.' + file.name.split('.').at(-1),
      '-vn',
      '-b:a',
      '128k',
      'output.mp3',
    ]);
    if (result !== 0) throw new Error('Conversion failed. You may upload the original recording.');
    const bytes = await ffmpeg.readFile('output.mp3');
    if (typeof bytes === 'string') throw new Error('Conversion produced no audio.');
    return new File([new Uint8Array(bytes)], file.name.replace(/\.[^.]+$/, '.mp3'), {
      type: 'audio/mpeg',
    });
  } finally {
    signal.removeEventListener('abort', abort);
    ffmpeg.terminate();
    URL.revokeObjectURL(coreURL);
  }
}
