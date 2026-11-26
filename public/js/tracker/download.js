// Downloads CSV text from the tracker without a request to the server.
export function downloadCsv(text, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
